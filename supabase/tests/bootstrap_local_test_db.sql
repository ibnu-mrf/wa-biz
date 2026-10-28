-- ====================================================================
-- WABiz: Bootstrap Database Pengujian Fisik Terisolasi
-- Target  : wabiz_local_test (PostgreSQL 18 Lokal)
-- Berkas  : supabase/tests/bootstrap_local_test_db.sql
-- Status  : Disiapkan untuk pengujian lokal terisolasi
-- ====================================================================

-- 1. PENGAMAN TARGET DATABASE (FAIL-CLOSED GUARD)
-- Memastikan skrip HANYA dapat dieksekusi pada database khusus 'wabiz_local_test'.
-- Mencegah eksekusi tidak sengaja pada database postgres, template1, atau database lain.
DO $$
BEGIN
    IF current_database() <> 'wabiz_local_test' THEN
        RAISE EXCEPTION 'ABORT: Skrip bootstrap HANYA boleh dijalankan pada database wabiz_local_test! Database aktif saat ini: %', current_database();
    END IF;
END $$;

-- 2. CANARY ENVIRONMENT MARKER (SESI AKTIF)
-- Memasang penanda lingkungan pada sesi bootstrap aktif setelah pemeriksaan database.
SET wabiz.environment = 'isolated_local_test';

-- 3. EKSTENSI KRIPTOGRAFI
-- Mengaktifkan ekstensi pgcrypto yang dibutuhkan oleh migrasi baseline WABiz.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 4. STUB PERAN SUPABASE (NOLOGIN)
-- Menyediakan peran anon, authenticated, dan service_role agar perintah
-- GRANT, REVOKE, dan pembuatan kebijakan RLS pada migrasi tidak gagal.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END $$;

-- 5. SKEMA AUTH & STUB TABEL auth.users (FOREIGN KEY ANCHOR)
-- Menyediakan skema auth dan tabel auth.users minimal untuk memenuhi foreign key
-- pada public.organization_members(user_id) ON DELETE CASCADE.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. STUB FUNGSI auth.uid()
-- Menyediakan fungsi auth.uid() yang mengembalikan tipe UUID untuk memenuhi
-- fungsi pembantu (is_org_member, create_organization_for_current_user) dan RLS.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- 7. CANARY ENVIRONMENT MARKER DATABASE (PERSISTEN)
-- Dipasang di akhir setelah seluruh langkah bootstrap lain berhasil diselesaikan,
-- agar database tidak ditandai sebagai 'isolated_local_test' jika bootstrap gagal di tengah jalan.
ALTER DATABASE wabiz_local_test SET wabiz.environment = 'isolated_local_test';
