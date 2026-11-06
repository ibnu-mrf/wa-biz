-- ====================================================================
-- WABiz Migration Draft: Multi-Organization Types & Custom Contact Labels
-- ====================================================================
-- Status: DRAFT / UNEXECUTED (Untuk ditinjau, JANGAN dijalankan otomatis)
-- Tanggal: 1 November 2026
--
-- Tujuan:
-- 1. Menambahkan kolom `custom_labels` pada `public.organization_profiles`
--    untuk menyimpan daftar label/segmen kontak unik milik tiap organisasi.
-- 2. Menambahkan GIN Index pada `public.contacts(labels)` untuk efisiensi
--    query penyaringan segmen kontak dan kampanye siaran WhatsApp.
-- 3. Menyediakan RPC functions atomik dan terproteksi:
--    - rename_organization_contact_label
--    - delete_organization_contact_label
--    dengan validasi otorisasi (Owner/Admin), validasi duplikasi case-insensitive,
--    pengamanan search_path, dan isolasi tenant ketat.
-- ====================================================================

begin;

-- 1. Tambah kolom custom_labels pada tabel organization_profiles jika belum ada
alter table public.organization_profiles
  add column if not exists custom_labels text[] not null default '{}';

comment on column public.organization_profiles.custom_labels is
  'Daftar label/segmen kontak kustom yang didefinisikan dan dikelola secara mandiri oleh masing-masing organisasi.';

-- 2. Tambah GIN Index pada contacts.labels untuk mempercepat pencarian dan filter segmen
create index if not exists contacts_labels_gin_idx
  on public.contacts using gin (labels);

-- 3. RPC Function: Pengubahan Nama Label (Atomic Rename)
-- Mengganti string label lama menjadi label baru pada seluruh kontak organisasi
-- serta pada array custom_labels profil organisasi secara bersamaan.
-- Status follow-up dan data kontak lainnya dijamin tidak berubah.
create or replace function public.rename_organization_contact_label(
  target_org_id uuid,
  old_label text,
  new_label text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
  clean_old text := trim(old_label);
  clean_new text := trim(new_label);
  current_labels text[];
  existing_item text;
begin
  -- A. Validasi Autentikasi Pengguna
  if auth.uid() is null then
    raise exception 'Akses ditolak: Autentikasi diperlukan.'
      using errcode = '42501';
  end if;

  -- B. Validasi Keanggotaan & Otorisasi Role: Hanya Owner atau Admin
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Akses ditolak: Hanya Owner atau Admin yang berwenang mengubah label organisasi.'
      using errcode = '42501';
  end if;

  -- C. Validasi String Input
  if clean_old is null or clean_old = '' then
    raise exception 'Nama label lama tidak boleh kosong.'
      using errcode = '22023';
  end if;

  if clean_new is null or clean_new = '' then
    raise exception 'Nama label baru tidak boleh kosong.'
      using errcode = '22023';
  end if;

  -- Validasi: Tolak nama label yang bertabrakan dengan status tindak lanjut operasional
  if lower(clean_new) in ('belum dihubungi', 'sudah dihubungi', 'perlu follow-up') then
    raise exception 'Nama label tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").'
      using errcode = '22023';
  end if;

  if lower(clean_old) = lower(clean_new) then
    return 0;
  end if;

  -- D. Validasi Duplikasi Case-Insensitive pada Profil Organisasi
  select custom_labels into current_labels
  from public.organization_profiles
  where organization_id = target_org_id;

  if current_labels is not null then
    foreach existing_item in array current_labels loop
      if lower(existing_item) = lower(clean_new) and lower(existing_item) <> lower(clean_old) then
        raise exception 'Label dengan nama "%" sudah terdaftar dalam organisasi ini (duplikasi tidak diizinkan).'
          , clean_new using errcode = '23505';
      end if;
    end loop;
  end if;

  -- E. Perbarui kontak yang memuat label lama (Hanya pada organisasi target)
  -- array_replace secara tepat mengganti elemen string label tanpa menyentuh status atau field lain.
  update public.contacts
  set labels = array_replace(labels, clean_old, clean_new),
      updated_at = now()
  where organization_id = target_org_id
    and clean_old = any(labels);

  get diagnostics updated_count = row_count;

  -- F. Perbarui daftar custom_labels pada profil organisasi
  update public.organization_profiles
  set custom_labels = array_replace(custom_labels, clean_old, clean_new),
      updated_at = now()
  where organization_id = target_org_id
    and clean_old = any(custom_labels);

  return updated_count;
end;
$$;

revoke all on function public.rename_organization_contact_label(uuid, text, text) from public, anon;
grant execute on function public.rename_organization_contact_label(uuid, text, text) to authenticated;

-- 4. RPC Function: Penghapusan Label Aman (Safe Delete with Optional Replacement)
-- Menghapus label dari kontak dan profil organisasi. Jika replacement_label disertakan,
-- kontak yang memiliki label lama akan dialihkan ke label pengganti secara atomik.
-- Status follow-up dan data kontak lainnya dijamin tidak berubah.
create or replace function public.delete_organization_contact_label(
  target_org_id uuid,
  label_to_delete text,
  replacement_label text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer := 0;
  clean_delete text := trim(label_to_delete);
  clean_replace text := nullif(trim(replacement_label), '');
  current_labels text[];
  found_replace boolean := false;
  existing_item text;
begin
  -- A. Validasi Autentikasi Pengguna
  if auth.uid() is null then
    raise exception 'Akses ditolak: Autentikasi diperlukan.'
      using errcode = '42501';
  end if;

  -- B. Validasi Keanggotaan & Otorisasi Role: Hanya Owner atau Admin
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  ) then
    raise exception 'Akses ditolak: Hanya Owner atau Admin yang berwenang menghapus label organisasi.'
      using errcode = '42501';
  end if;

  -- C. Validasi String Input
  if clean_delete is null or clean_delete = '' then
    raise exception 'Nama label yang akan dihapus tidak boleh kosong.'
      using errcode = '22023';
  end if;

  if clean_replace is not null and lower(clean_replace) = lower(clean_delete) then
    raise exception 'Label pengganti tidak boleh sama dengan label yang akan dihapus.'
      using errcode = '22023';
  end if;

  -- Validasi: Tolak label pengganti yang bertabrakan dengan status tindak lanjut operasional
  if clean_replace is not null and lower(clean_replace) in ('belum dihubungi', 'sudah dihubungi', 'perlu follow-up') then
    raise exception 'Label pengganti tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").'
      using errcode = '22023';
  end if;

  -- D. Perbarui kontak (Isolasi ketat: Hanya pada target_org_id)
  if clean_replace is not null then
    -- Ganti label lama dengan replacement_label tanpa mengganggu status atau field kontak lainnya
    update public.contacts
    set labels = array_replace(labels, clean_delete, clean_replace),
        updated_at = now()
    where organization_id = target_org_id
      and clean_delete = any(labels);
  else
    -- Hapus label lama dari array kontak tanpa mengganggu status follow-up
    update public.contacts
    set labels = array_remove(labels, clean_delete),
        updated_at = now()
    where organization_id = target_org_id
      and clean_delete = any(labels);
  end if;

  get diagnostics affected_count = row_count;

  -- E. Hapus label dari array custom_labels pada profil organisasi
  update public.organization_profiles
  set custom_labels = array_remove(custom_labels, clean_delete),
      updated_at = now()
  where organization_id = target_org_id
    and clean_delete = any(custom_labels);

  -- F. Jika ada replacement_label dan belum terdaftar di custom_labels, tambahkan agar konsisten
  -- Menangani secara benar kondisi custom_labels NULL maupun array kosong '{}'
  if clean_replace is not null then
    select custom_labels into current_labels
    from public.organization_profiles
    where organization_id = target_org_id;

    if current_labels is null or array_length(current_labels, 1) is null or array_length(current_labels, 1) = 0 then
      -- Jika custom_labels masih kosong atau NULL, inisialisasi dengan replacement_label
      update public.organization_profiles
      set custom_labels = array[clean_replace],
          updated_at = now()
      where organization_id = target_org_id;
    else
      -- Jika sudah memiliki elemen, periksa apakah replacement_label sudah ada (case-insensitive)
      foreach existing_item in array current_labels loop
        if lower(existing_item) = lower(clean_replace) then
          found_replace := true;
          exit;
        end if;
      end loop;

      if not found_replace then
        update public.organization_profiles
        set custom_labels = array_append(custom_labels, clean_replace),
            updated_at = now()
        where organization_id = target_org_id;
      end if;
    end if;
  end if;

  return affected_count;
end;
$$;

revoke all on function public.delete_organization_contact_label(uuid, text, text) from public, anon;
grant execute on function public.delete_organization_contact_label(uuid, text, text) to authenticated;

commit;
