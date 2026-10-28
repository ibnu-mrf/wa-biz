-- ====================================================================
-- WABiz Migrasi: Penambahan Dukungan Provider OpenWA, Deduplikasi Atomik,
-- Lease Fencing, & Arsitektur Pemulihan AI Tahan Retry (Crash-Resilient Recovery)
-- ====================================================================
-- Berkas: supabase/migrations/20261025120000_add_openwa_provider_support.sql
-- Status : DRAFT / PREPARED (TIDAK BOLEH DIJALANKAN OTOMATIS SEBELUM AKTIVASI)
-- ====================================================================
--
-- PANDUAN OPERATOR & DIAGNOSTIK PRA-MIGRASI (READ-ONLY)
-- -----------------------------------------------------
-- Sebelum menjalankan migrasi ini di database produksi, jalankan kueri
-- diagnostik berikut untuk memastikan tidak ada konflik data atau nama constraint:
--
-- 1. Diagnostik Duplikasi Historis:
--    SELECT organization_id, provider_type, provider_message_id, COUNT(*) AS dup_count
--    FROM public.messages
--    WHERE provider_message_id IS NOT NULL
--    GROUP BY organization_id, provider_type, provider_message_id
--    HAVING COUNT(*) > 1;
--    (Jika mengembalikan baris, lakukan dedup manual sebelum menerapkan UNIQUE INDEX).
--
-- 2. Diagnostik Nama Constraint Aktual:
--    SELECT conname, relname, contype, pg_get_constraintdef(c.oid)
--    FROM pg_constraint c
--    JOIN pg_class r ON c.conrelid = r.oid
--    WHERE relname IN ('organization_whatsapp_configs', 'messages', 'campaign_recipients');
--    (Pastikan nama constraint cocok sebelum DROP CONSTRAINT IF EXISTS).
-- ====================================================================

-- 1. PERBARUI CHECK CONSTRAINT: organization_whatsapp_configs
ALTER TABLE public.organization_whatsapp_configs
    DROP CONSTRAINT IF EXISTS organization_whatsapp_configs_provider_type_check;

ALTER TABLE public.organization_whatsapp_configs
    ADD CONSTRAINT organization_whatsapp_configs_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api', 'openwa'));

-- 2. PERBARUI CHECK CONSTRAINT: messages
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_provider_type_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api', 'openwa'));

-- 3. PERBARUI CHECK CONSTRAINT: campaign_recipients
ALTER TABLE public.campaign_recipients
    DROP CONSTRAINT IF EXISTS campaign_recipients_provider_type_check;

ALTER TABLE public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api', 'openwa'));

-- 4. PARTIAL UNIQUE INDEX DEDUPLIKASI ATOMIK: messages
-- Cakupan keunikan: (organization_id, provider_type, provider_message_id)
-- Alasan desain:
-- - Menjamin isolasi multi-tenant: message ID dari satu organisasi tidak akan berbenturan dengan organisasi lain.
-- - Menjamin keunikan per provider: mencegah tabrakan format ID antar provider yang berbeda.
-- - Partial index (WHERE provider_message_id IS NOT NULL): pesan manual/lokal tanpa provider_message_id (NULL)
--   tidak akan saling memblokir satu sama lain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_org_provider_msg_id
    ON public.messages (organization_id, provider_type, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 5. STANDARD NON-UNIQUE INDEX: campaign_recipients
-- Catatan audit: Tabel campaign_recipients telah memiliki UNIQUE (campaign_id, phone).
-- Jangan membuat unique index pada provider_message_id di tabel ini agar broadcast retry
-- dan error tracking tidak menyebabkan kegagalan constraint.
DROP INDEX IF EXISTS uq_campaign_recipients_org_provider_msg_id;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_provider_msg_id
    ON public.campaign_recipients (organization_id, provider_type, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 6. DUKUNGAN ATRIBUSI BALASAN EKSPLISIT: reply_to_message_id
-- Mengaitkan pesan balasan (bot/agent) secara langsung ke pesan masuk (customer).
-- ON DELETE SET NULL: Menjamin jika pesan pelanggan dihapus, riwayat balasan tetap utuh.
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_message_id
    ON public.messages (reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

-- 7. DUKUNGAN PEMULIHAN AI, LEASE FENCING & ATOMISITAS:
-- - ai_status & ai_locked_at: Status siklus hidup pekerjaan AI dan timestamp lock.
-- - ai_lease_token: Token unik per klaim aktif untuk memagari status update (Lease Fencing).
-- - ai_dispatch_started_at: Penanda persisten bahwa pengiriman outbound ke gateway telah dimulai.
--   Mencegah pengambilalihan stale lock secara buta jika pengiriman mungkin sudah terjadi di gateway.
--
-- DEFAULT 'completed': Menjamin seluruh pesan historis lama yang sudah ada di database
-- TIDAK dianggap sebagai pekerjaan pending baru (menghindari spam balasan massal saat aktivasi).
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS ai_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_lease_token UUID,
    ADD COLUMN IF NOT EXISTS ai_dispatch_started_at TIMESTAMPTZ;

ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_ai_status_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_ai_status_check
    CHECK (ai_status IN ('pending', 'processing', 'completed', 'failed', 'needs_reconciliation'));

-- Index performa untuk pencarian pekerjaan pending / processing / needs_reconciliation per tenant
CREATE INDEX IF NOT EXISTS idx_messages_org_ai_status
    ON public.messages (organization_id, ai_status, created_at)
    WHERE ai_status IN ('pending', 'processing', 'needs_reconciliation');

-- ====================================================================
-- 8. POSTGRESQL STORED PROCEDURES (RPC) UNTUK OPERASI ATOMIK
-- ====================================================================

-- 8A. RPC KLAIM PEKERJAAN ATOMIK DENGAN LEASE FENCING
-- Fungsi ini mengunci baris (FOR UPDATE) dan mengklaim pesan hanya jika:
-- 1. Berstatus 'pending' ATAU
-- 2. Berstatus 'processing' dengan lock stale (> p_lock_timeout_seconds) DAN
--    belum pernah memasuki tahap pengiriman (ai_dispatch_started_at IS NULL).
-- Jika stale namun ai_dispatch_started_at IS NOT NULL (pengiriman mungkin sudah terjadi di gateway),
-- fungsi secara atomik mengalihkan status ke 'needs_reconciliation' demi mencegah balasan ganda.
CREATE OR REPLACE FUNCTION public.claim_inbound_message_for_ai(
    p_organization_id UUID,
    p_message_id UUID,
    p_lock_timeout_seconds INT DEFAULT 180
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_msg RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_new_lease_token UUID := gen_random_uuid();
    v_stale_threshold TIMESTAMPTZ;
BEGIN
    -- Validasi parameter wajib
    IF p_organization_id IS NULL OR p_message_id IS NULL THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'reason', 'missing_params'
        );
    END IF;

    -- Hitung ambang batas waktu lock kedaluwarsa
    v_stale_threshold := v_now - (p_lock_timeout_seconds || ' seconds')::INTERVAL;

    -- Kunci baris pesan secara atomik (Row-Level Locking) dengan isolasi tenant ketat
    SELECT id, organization_id, ai_status, ai_locked_at, ai_lease_token, ai_dispatch_started_at
    INTO v_msg
    FROM public.messages
    WHERE id = p_message_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    -- 1. Pesan tidak ditemukan dalam cakupan organisasi ini
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'reason', 'message_not_found'
        );
    END IF;

    -- 2. Pesan sudah selesai (completed)
    IF v_msg.ai_status = 'completed' THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'current_status', 'completed',
            'reason', 'already_completed'
        );
    END IF;

    -- 3. Pesan memerlukan rekonsiliasi manual / pengiriman tak-tentu
    IF v_msg.ai_status = 'needs_reconciliation' THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'current_status', 'needs_reconciliation',
            'reason', 'needs_reconciliation'
        );
    END IF;

    -- 4. Pesan berstatus failed definitif
    IF v_msg.ai_status = 'failed' THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'current_status', 'failed',
            'reason', 'already_failed'
        );
    END IF;

    -- 5. Pesan sedang diproses (processing)
    IF v_msg.ai_status = 'processing' THEN
        -- A. Lock masih aktif (belum melewati ambang stale)
        IF v_msg.ai_locked_at IS NOT NULL AND v_msg.ai_locked_at > v_stale_threshold THEN
            RETURN jsonb_build_object(
                'claimed', false,
                'current_status', 'processing',
                'reason', 'in_progress_lock'
            );
        END IF;

        -- B. Lock sudah stale: Evaluasi apakah pengiriman outbound mungkin sudah dimulai
        IF v_msg.ai_dispatch_started_at IS NOT NULL THEN
            -- Pengiriman mungkin sudah dilakukan oleh worker lama ke gateway WhatsApp.
            -- Jangan klaim ulang secara buta! Alihkan status ke needs_reconciliation.
            UPDATE public.messages
            SET ai_status = 'needs_reconciliation',
                ai_locked_at = NULL
            WHERE id = p_message_id
              AND organization_id = p_organization_id;

            RETURN jsonb_build_object(
                'claimed', false,
                'current_status', 'needs_reconciliation',
                'reason', 'dispatch_in_doubt_needs_reconciliation'
            );
        END IF;

        -- C. Lock stale dan pengiriman terbukti belum pernah dimulai (ai_dispatch_started_at IS NULL).
        -- Aman untuk diambil alih oleh worker baru!
    END IF;

    -- Validasi eksplisit: Hanya pesan berstatus 'pending' atau 'processing' (stale tanpa dispatch) yang dapat diklaim
    IF v_msg.ai_status IS NULL OR v_msg.ai_status NOT IN ('pending', 'processing') THEN
        RETURN jsonb_build_object(
            'claimed', false,
            'current_status', COALESCE(v_msg.ai_status, 'unknown'),
            'reason', 'unclaimable_status'
        );
    END IF;

    -- 6. Eksekusi klaim: perbarui status, timestamp lock, lease token baru, dan reset dispatch flag
    UPDATE public.messages
    SET ai_status = 'processing',
        ai_locked_at = v_now,
        ai_lease_token = v_new_lease_token,
        ai_dispatch_started_at = NULL
    WHERE id = p_message_id
      AND organization_id = p_organization_id;

    RETURN jsonb_build_object(
        'claimed', true,
        'lease_token', v_new_lease_token,
        'current_status', 'processing'
    );
END;
$$;

-- 8B. RPC PENANDAAN TAHAP PENGIRIMAN OUTBOUND (PRE-DISPATCH CHECK)
-- Memastikan bahwa worker yang memegang lease sah menandai dimulainya kontak ke gateway WhatsApp.
-- Jika lease token tidak cocok (misal dicuri worker lain), mengembalikan false.
CREATE OR REPLACE FUNCTION public.mark_inbound_message_dispatching(
    p_organization_id UUID,
    p_message_id UUID,
    p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    IF p_organization_id IS NULL OR p_message_id IS NULL OR p_lease_token IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.messages
    SET ai_dispatch_started_at = clock_timestamp()
    WHERE id = p_message_id
      AND organization_id = p_organization_id
      AND ai_lease_token = p_lease_token
      AND ai_status = 'processing'
    RETURNING id INTO v_updated_id;

    RETURN v_updated_id IS NOT NULL;
END;
$$;

-- 8C. RPC PEMBARUAN STATUS DENGAN VERIFIKASI LEASE (LEASE FENCING)
-- Memastikan hanya worker yang memegang lease_token yang dapat mengubah status akhir.
-- Mencegah stale worker menimpa hasil worker baru.
-- Jika baris memiliki ai_lease_token, token pemanggil WAJIB cocok; token NULL atau salah akan ditolak.
CREATE OR REPLACE FUNCTION public.update_inbound_message_ai_status(
    p_organization_id UUID,
    p_message_id UUID,
    p_status TEXT,
    p_lease_token UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    -- 1. Validasi parameter wajib
    IF p_organization_id IS NULL OR p_message_id IS NULL OR p_status IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. Validasi status yang diizinkan sesuai constraint CHECK
    IF p_status NOT IN ('pending', 'processing', 'completed', 'failed', 'needs_reconciliation') THEN
        RETURN FALSE;
    END IF;

    -- 3. Update atomik berpagar lease (Lease Fencing):
    -- Jika baris memiliki ai_lease_token terpasang, p_lease_token HARUS cocok.
    -- Jika baris tidak memiliki ai_lease_token (pesan non-AI / legacy), p_lease_token NULL diizinkan.
    UPDATE public.messages
    SET ai_status = p_status,
        ai_locked_at = CASE 
            WHEN p_status IN ('completed', 'failed', 'needs_reconciliation') THEN NULL 
            ELSE ai_locked_at 
        END
    WHERE id = p_message_id
      AND organization_id = p_organization_id
      AND (
          (p_lease_token IS NOT NULL AND ai_lease_token = p_lease_token)
          OR
          (p_lease_token IS NULL AND ai_lease_token IS NULL)
      )
    RETURNING id INTO v_updated_id;

    RETURN v_updated_id IS NOT NULL;
END;
$$;

-- HAK AKSES DAN KEAMANAN RPC (LEAST PRIVILEGE)
-- Cabut akses dari publik, anon, dan authenticated untuk mencegah eskalasi hak akses
REVOKE ALL ON FUNCTION public.claim_inbound_message_for_ai(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_inbound_message_dispatching(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_inbound_message_ai_status(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Berikan hak eksekusi HANYA kepada service_role (backend worker internal)
GRANT EXECUTE ON FUNCTION public.claim_inbound_message_for_ai(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_inbound_message_dispatching(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_inbound_message_ai_status(UUID, UUID, TEXT, UUID) TO service_role;

-- ====================================================================
-- CATATAN OPERATOR:
-- Migrasi ini bersifat non-destruktif (tidak menghapus data atau kolom apa pun).
-- JANGAN MENJALANKAN MIGRASI INI SEBELUM PERSETUJUAN RESMI FASE AKTIVASI.
-- ====================================================================
