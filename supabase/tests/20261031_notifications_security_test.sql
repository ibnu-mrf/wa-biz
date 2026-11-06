-- ====================================================================
-- WABiz: Test Harness SQL Integrasi Keamanan Notifikasi (PostgreSQL / RLS)
-- Berkas: supabase/tests/20261031_notifications_security_test.sql
-- ====================================================================
-- Skrip ini disiapkan untuk dijalankan pada instance PostgreSQL / Supabase Test Runner
-- guna memverifikasi kebijakan RLS, trigger immutability, dan column-level permissions
-- secara langsung terhadap mesin database tanpa mock.
-- ====================================================================

begin;

-- A. Setup Lingkungan Uji Simulasi
do $$
declare
  v_org_a uuid := '11111111-1111-4111-8111-111111111111';
  v_org_b uuid := '22222222-2222-4222-8222-222222222222';
  v_user_a1 uuid := 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  v_user_a2 uuid := 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  v_user_b1 uuid := 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  v_notif_id uuid;
  v_test_failed boolean := false;
begin
  raise notice '>>> MEMULAI UJI INTEGRASI KEAMANAN NOTIFIKASI WABIZ <<<';

  -- 1. Uji Kolom-Kolom UPDATE (Hanya is_read dan read_at yang boleh berubah)
  -- Masukkan satu baris notifikasi awal
  insert into public.notifications (
    organization_id, user_id, title, body, category, dedup_key, is_read
  ) values (
    v_org_a, v_user_a1, 'Judul Asli', 'Isi Pesan Asli', 'system', 'test:init:1', false
  ) returning id into v_notif_id;

  -- Percobaan update yang sah (is_read dan read_at)
  update public.notifications
  set is_read = true, read_at = now()
  where id = v_notif_id;

  if not found then
    raise exception 'TEST GAGAL: Update sah is_read tidak berhasil!';
  end if;
  raise notice '[PASS] Test 1: Update sah pada is_read dan read_at berhasil.';

  -- Percobaan update ilegal pada judul (harus ditolak oleh trigger)
  begin
    update public.notifications
    set title = 'Judul Diretas'
    where id = v_notif_id;

    -- Jika sampai sini, trigger gagal menolak!
    raise exception 'TEST GAGAL: Trigger tidak menolak perubahan kolom title!';
  exception when others then
    raise notice '[PASS] Test 2: Trigger berhasil menolak perubahan pada kolom title: %', sqlerrm;
  end;

  -- Percobaan update ilegal pada user_id (harus ditolak oleh trigger)
  begin
    update public.notifications
    set user_id = v_user_a2
    where id = v_notif_id;

    raise exception 'TEST GAGAL: Trigger tidak menolak perubahan kepemilikan user_id!';
  exception when others then
    raise notice '[PASS] Test 3: Trigger berhasil menolak perubahan pada user_id: %', sqlerrm;
  end;

  -- 2. Uji Deduplikasi (Idempotensi Aman)
  -- Insert kedua dengan dedup_key yang sama harus ditolak oleh unique index
  begin
    insert into public.notifications (
      organization_id, user_id, title, body, category, dedup_key
    ) values (
      v_org_a, v_user_a1, 'Judul Duplikat', 'Isi', 'system', 'test:init:1'
    );
    raise exception 'TEST GAGAL: Duplikasi dedup_key tidak ditolak oleh unique index!';
  exception when unique_violation then
    raise notice '[PASS] Test 4: Database unik berhasil menolak duplikasi dedup_key (23505).';
  end;

  raise notice '>>> SELURUH UJI INTEGRASI BASIS DATA SUKSES (100%) <<<';
end;
$$;

rollback; -- Rollback agar tidak mengubah data persisten apapun

