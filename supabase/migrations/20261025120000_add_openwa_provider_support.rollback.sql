-- ====================================================================
-- WABiz Prosedur Rollback: Reversi Migrasi OpenWA Provider Support
-- ====================================================================
-- Berkas: supabase/migrations/20261025120000_add_openwa_provider_support.rollback.sql
-- Status : DRAFT / PREPARED (HANYA DIGUNAKAN JIKA ROLLBACK DIPERLUKAN)
-- ====================================================================
-- PERINGATAN OPERATOR:
-- 1. Rollback skema database TIDAK DAPAT membatalkan pesan WhatsApp yang
--    sudah terkirim ke pelanggan atau memulihkan pesan yang telah dihapus.
-- 2. Pastikan seluruh instance worker WABiz telah dialihkan kembali ke
--    provider Baileys / Meta Cloud API sebelum mengeksekusi rollback ini.
-- 3. Jangan mengeksekusi skrip ini tanpa backup data messages dan configs.
-- ====================================================================

-- 1. CABUT DAN HAPUS FUNGSI STORED PROCEDURES (RPC)
DROP FUNCTION IF EXISTS public.claim_inbound_message_for_ai(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.mark_inbound_message_dispatching(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.update_inbound_message_ai_status(UUID, UUID, TEXT, UUID);

-- 2. HAPUS INDEKS YANG BARU DITAMBAHKAN
DROP INDEX IF EXISTS public.idx_messages_org_ai_status;
DROP INDEX IF EXISTS public.idx_messages_reply_to_message_id;
DROP INDEX IF EXISTS public.idx_campaign_recipients_provider_msg_id;
DROP INDEX IF EXISTS public.uq_messages_org_provider_msg_id;

-- 3. ALIKAN DATA OPENWA KE BAILEYS SEBELUM MENGEMBALIKAN CONSTRAINT
-- Mencegah kegagalan ADD CONSTRAINT CHECK jika ada baris bertipe 'openwa'
UPDATE public.organization_whatsapp_configs
SET provider_type = 'baileys', updated_at = timezone('utc'::text, now())
WHERE provider_type = 'openwa';

UPDATE public.messages
SET provider_type = 'baileys'
WHERE provider_type = 'openwa';

UPDATE public.campaign_recipients
SET provider_type = 'baileys'
WHERE provider_type = 'openwa';

-- 4. KEMBALIKAN CHECK CONSTRAINT: campaign_recipients (Hanya Baileys & Meta Cloud API)
ALTER TABLE public.campaign_recipients
    DROP CONSTRAINT IF EXISTS campaign_recipients_provider_type_check;

ALTER TABLE public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api'));

-- 5. KEMBALIKAN CHECK CONSTRAINT: messages (Hanya Baileys & Meta Cloud API)
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_provider_type_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api'));

-- 6. KEMBALIKAN CHECK CONSTRAINT: organization_whatsapp_configs
ALTER TABLE public.organization_whatsapp_configs
    DROP CONSTRAINT IF EXISTS organization_whatsapp_configs_provider_type_check;

ALTER TABLE public.organization_whatsapp_configs
    ADD CONSTRAINT organization_whatsapp_configs_provider_type_check
    CHECK (provider_type IN ('baileys', 'meta_cloud_api'));

-- 7. HAPUS CONSTRAINT ai_status DARI messages (JIKA DIPERLUKAN)
ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_ai_status_check;

-- 7. REVERSI KOLOM TAMBAHAN (OPSIONAL / NON-DESTRUKTIF)
-- CATATAN: Untuk mencegah kehilangan riwayat relasi balasan (reply_to_message_id)
-- dan log status ai_status yang sudah tercatat selama masa uji, kolom di bawah ini
-- DISARANKAN DIBIARKAN TETAP ADA namun tidak lagi digunakan oleh aplikasi.
-- Jika operator memutuskan untuk penghapusan total (destructive drop):
--
-- ALTER TABLE public.messages
--     DROP COLUMN IF EXISTS reply_to_message_id,
--     DROP COLUMN IF EXISTS ai_status,
--     DROP COLUMN IF EXISTS ai_locked_at,
--     DROP COLUMN IF EXISTS ai_lease_token,
--     DROP COLUMN IF EXISTS ai_dispatch_started_at;
-- ====================================================================
