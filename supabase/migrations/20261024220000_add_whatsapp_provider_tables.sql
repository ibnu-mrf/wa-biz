-- ====================================================================
-- WABiz Fase 6B: WhatsApp Provider Abstraction & Meta Cloud API Tables
-- ====================================================================
-- 1. Tabel konfigurasi provider WhatsApp per organisasi
-- 2. Skema rahasia private untuk token dan secret terenkripsi
-- 3. Kolom ekstensi non-destruktif pada public.messages & public.campaign_recipients
-- 4. Kebijakan isolasi ketat RLS per tenant
-- ====================================================================

-- 1. TABEL KONFIGURASI WHATSAPP ORGANISASI (PUBLIC METADATA)
CREATE TABLE IF NOT EXISTS public.organization_whatsapp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider_type TEXT NOT NULL DEFAULT 'baileys' CHECK (provider_type IN ('baileys', 'meta_cloud_api')),
    waba_id TEXT,                          -- Meta WhatsApp Business Account ID
    phone_number_id TEXT UNIQUE,           -- Meta Phone Number ID (Unique untuk routing webhook)
    display_phone_number TEXT,             -- Nomor telepon format E.164 (+62...)
    verified_name TEXT,                    -- Nama tampilan resmi yang disetujui Meta
    quality_rating TEXT CHECK (quality_rating IN ('GREEN', 'YELLOW', 'RED', 'UNKNOWN', NULL)),
    messaging_tier TEXT DEFAULT 'TIER_1K', -- TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_org_whatsapp_config UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_wa_configs_phone_id ON public.organization_whatsapp_configs(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_org_wa_configs_org_id ON public.organization_whatsapp_configs(organization_id);

-- 2. SKEMA RAHASIA KHUSUS SERVER (PRIVATE SECRETS SCHEMA)
-- PostgREST API tidak dapat mengakses skema ini dari sisi anon maupun authenticated
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role, postgres;

CREATE TABLE IF NOT EXISTS private.organization_whatsapp_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    encrypted_system_token TEXT NOT NULL,  -- Meta System User Permanent Token (terenkripsi)
    encrypted_app_secret TEXT NOT NULL,    -- Meta App Secret untuk verifikasi webhook (terenkripsi)
    webhook_verify_token TEXT NOT NULL,    -- Verify Token untuk challenge GET webhook
    encryption_key_id TEXT NOT NULL DEFAULT 'v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_org_wa_secrets UNIQUE (organization_id)
);

REVOKE ALL ON TABLE private.organization_whatsapp_secrets FROM PUBLIC;
REVOKE ALL ON TABLE private.organization_whatsapp_secrets FROM anon;
REVOKE ALL ON TABLE private.organization_whatsapp_secrets FROM authenticated;
GRANT ALL ON TABLE private.organization_whatsapp_secrets TO service_role, postgres;

-- 3. KOLOM EKSTENSI NON-DESTRUKTIF PADA TABEL PESAN EKSISTING
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS provider_type TEXT DEFAULT 'baileys' CHECK (provider_type IN ('baileys', 'meta_cloud_api')),
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'delivered' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    ADD COLUMN IF NOT EXISTS delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_provider_msg_id ON public.messages(provider_message_id);

-- Ekstensi kolom pada antrean penerima kampanye
ALTER TABLE public.campaign_recipients
    ADD COLUMN IF NOT EXISTS provider_type TEXT DEFAULT 'baileys' CHECK (provider_type IN ('baileys', 'meta_cloud_api')),
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_provider_msg_id ON public.campaign_recipients(provider_message_id);

-- 4. KEBIJAKAN ROW LEVEL SECURITY (RLS)
ALTER TABLE public.organization_whatsapp_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their organization's WhatsApp config" ON public.organization_whatsapp_configs;
CREATE POLICY "Users can view their organization's WhatsApp config"
    ON public.organization_whatsapp_configs
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can manage their organization's WhatsApp config" ON public.organization_whatsapp_configs;
CREATE POLICY "Admins can manage their organization's WhatsApp config"
    ON public.organization_whatsapp_configs
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.organization_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- 5. INISIALISASI DEFAULT STAGING ORGANISASI (BAILEYS TETAP AKTIF)
-- Pastikan organisasi staging yang sedang berjalan terkonfigurasi ke Baileys
INSERT INTO public.organization_whatsapp_configs (
    organization_id,
    provider_type,
    display_phone_number,
    verified_name,
    quality_rating,
    messaging_tier,
    is_active
)
SELECT 
    id,
    'baileys',
    '6285641886993',
    'PDF Anwaarunnajah (Staging)',
    'GREEN',
    'UNLIMITED_STAGING',
    TRUE
FROM public.organizations
WHERE id = '12cc398e-9c11-4f30-a665-0583f369fd77'
ON CONFLICT (organization_id) DO UPDATE
SET updated_at = timezone('utc'::text, now());
