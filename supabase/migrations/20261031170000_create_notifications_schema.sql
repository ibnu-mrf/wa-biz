-- ====================================================================
-- WABiz: Migrasi Skema Notifikasi Dalam Aplikasi (In-App Notifications)
-- Berkas: supabase/migrations/20261031170000_create_notifications_schema.sql
-- ====================================================================

begin;

-- 1. Pembuatan Tabel Notifikasi
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  category text not null check (category in ('chat', 'contact', 'campaign', 'team', 'system')),
  reference_id text,
  reference_type text check (reference_type in ('conversation', 'contact', 'campaign', 'team_member', 'system') or reference_type is null),
  dedup_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- 2. Indeks Performa & Kueri Cepat
create index if not exists notifications_user_org_created_idx
  on public.notifications(user_id, organization_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications(user_id, organization_id, is_read)
  where is_read = false;

-- 3. Batasan Deduplikasi di Tingkat Basis Data (Idempotensi Aman)
create unique index if not exists notifications_dedup_idx
  on public.notifications(organization_id, user_id, dedup_key)
  where dedup_key is not null;

-- 4. Aktifkan Row Level Security (RLS)
alter table public.notifications enable row level security;

-- 5. Kebijakan RLS (Isolasi Ketat Berbasis user_id = auth.uid() & Anggota Organisasi)

-- SELECT: Pengguna hanya dapat membaca notifikasi milik mereka sendiri
drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

-- UPDATE: Pengguna hanya dapat mengubah notifikasi milik mereka sendiri
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  )
  with check (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

-- DELETE: Pengguna hanya dapat menghapus notifikasi milik mereka sendiri
drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
  on public.notifications for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

-- INSERT: Pengguna HANYA dapat membuat notifikasi langsung untuk diri mereka sendiri
-- Pembuatan notifikasi lintas pengguna langsung via client DILARANG PENUH untuk mencegah pemalsuan identitas
drop policy if exists "Users can insert own notifications" on public.notifications;
drop policy if exists "Authenticated users can insert notifications for org members" on public.notifications;
create policy "Users can insert own notifications"
  on public.notifications for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_org_member(organization_id)
  );

-- 6. Trigger Pengaman Kolom UPDATE (Hanya is_read dan read_at yang boleh diperbarui)
create or replace function public.notifications_enforce_read_only_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.id is distinct from old.id) or
     (new.organization_id is distinct from old.organization_id) or
     (new.user_id is distinct from old.user_id) or
     (new.title is distinct from old.title) or
     (new.body is distinct from old.body) or
     (new.category is distinct from old.category) or
     (new.reference_id is distinct from old.reference_id) or
     (new.reference_type is distinct from old.reference_type) or
     (new.dedup_key is distinct from old.dedup_key) or
     (new.created_at is distinct from old.created_at) then
    raise exception 'Hanya kolom is_read dan read_at yang diizinkan untuk diperbarui pada notifikasi';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifications_enforce_read_only on public.notifications;
create trigger trg_notifications_enforce_read_only
  before update on public.notifications
  for each row
  execute function public.notifications_enforce_read_only_fields();

-- 7. Tutup Celah Keamanan RPC Generik Bebas Teks
-- Hapus fungsi generik notify_organization_member agar pengguna biasa tidak dapat memalsukan notifikasi bebas untuk anggota lain
drop function if exists public.notify_organization_member(uuid, uuid, text, text, text, text, text, text);

-- 8. Prosedur Server Terverifikasi untuk Penugasan Percakapan CS (Domain-Specific Server Action)
-- Memvalidasi aktor, hak akses, status percakapan, dan meng-generate notifikasi secara otomatis di server
create or replace function public.assign_conversation_and_notify(
  p_conversation_id uuid,
  p_target_team_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_org_id uuid;
  v_caller_role text;
  v_target_user_id uuid;
  v_contact_name text;
  v_current_assigned uuid;
begin
  -- A. Validasi Autentikasi Pemanggil
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- B. Ambil Data Percakapan
  select c.organization_id, c.assigned_to, coalesce(ct.name, 'Pelanggan')
  into v_org_id, v_current_assigned, v_contact_name
  from public.conversations c
  left join public.contacts ct on ct.id = c.contact_id
  where c.id = p_conversation_id;

  if v_org_id is null then
    raise exception 'Conversation not found';
  end if;

  -- C. Validasi Keanggotaan & Peran Pemanggil
  select role into v_caller_role
  from public.organization_members
  where organization_id = v_org_id and user_id = v_caller_id;

  if v_caller_role is null then
    raise exception 'Caller is not a member of the organization';
  end if;

  -- D. Otorisasi Penugasan Percakapan:
  -- 1. Owner & Admin berhak menugaskan atau mengalihkan percakapan apapun (baik belum berpetugas maupun sudah dipegang agen lain).
  -- 2. Anggota biasa (member) DILARANG menugaskan percakapan yang belum memiliki petugas (v_current_assigned is null).
  -- 3. Anggota biasa HANYA boleh mengalihkan percakapan jika percakapan tersebut saat ini sedang ditugaskan kepada dirinya sendiri.
  if v_caller_role not in ('owner', 'admin') then
    if v_current_assigned is null then
      raise exception 'Unauthorized: Regular members cannot assign unassigned conversations';
    end if;

    if not exists (
      select 1 from public.team_members tm
      where tm.id = v_current_assigned
        and tm.organization_id = v_org_id
        and lower(tm.email) = lower((select email from auth.users where id = v_caller_id))
    ) then
      raise exception 'Unauthorized to reassign conversation belonging to another agent';
    end if;
  end if;

  -- E. Verifikasi Target Anggota Tim Aktif dalam Organisasi yang Sama
  if not exists (
    select 1 from public.team_members
    where id = p_target_team_member_id and organization_id = v_org_id and is_active = true
  ) then
    raise exception 'Target team member is not active in this organization';
  end if;

  -- F. Lakukan Update Penugasan Percakapan
  update public.conversations
  set assigned_to = p_target_team_member_id, updated_at = now()
  where id = p_conversation_id;

  -- G. Cari user_id akun target (jika terdaftar di auth.users) dan Terbitkan Notifikasi Server-Side
  select om.user_id into v_target_user_id
  from public.team_members tm
  join auth.users u on lower(u.email) = lower(tm.email)
  join public.organization_members om on om.organization_id = tm.organization_id and om.user_id = u.id
  where tm.id = p_target_team_member_id;

  if v_target_user_id is not null and v_target_user_id <> v_caller_id then
    insert into public.notifications (
      organization_id,
      user_id,
      title,
      body,
      category,
      reference_id,
      reference_type,
      dedup_key,
      is_read,
      created_at
    ) values (
      v_org_id,
      v_target_user_id,
      'Penugasan Percakapan Baru',
      'Percakapan dengan ' || v_contact_name || ' telah ditugaskan kepada Anda.',
      'chat',
      p_conversation_id::text,
      'conversation',
      'chat:assign:' || p_conversation_id || ':' || v_target_user_id,
      false,
      now()
    )
    on conflict (organization_id, user_id, dedup_key) where dedup_key is not null do nothing;
  end if;

  return true;
end;
$$;

-- 9. Hak Akses (Privileges & Column-Level Grants)
revoke all on public.notifications from public, anon;
grant select, insert, delete on public.notifications to authenticated;

-- Pembatasan Ketat UPDATE: HANYA kolom is_read dan read_at yang diberikan hak ke authenticated
revoke update on public.notifications from public, anon, authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

revoke all on function public.assign_conversation_and_notify(uuid, uuid) from public, anon;
grant execute on function public.assign_conversation_and_notify(uuid, uuid) to authenticated;

commit;
