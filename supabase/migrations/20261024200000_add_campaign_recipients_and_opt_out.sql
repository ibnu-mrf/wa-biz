-- ====================================================================
-- WABiz Phase 3: Campaign Execution, Recipients Queue & Contact Opt-Out
-- ====================================================================

-- 1. Tambah kolom opt-out pada tabel contacts jika belum ada
alter table public.contacts
  add column if not exists is_opted_out boolean not null default false,
  add column if not exists opted_out_at timestamptz;

-- 2. Tambah kolom metrik dan pengirim pada tabel campaigns
alter table public.campaigns
  add column if not exists sender_phone text,
  add column if not exists target_segment text not null default 'all',
  add column if not exists total_recipients integer not null default 0,
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists skipped_count integer not null default 0;

-- Perluas batasan status kampanye agar mendukung draft, scheduled, running/sending, completed/sent, cancelled, failed
alter table public.campaigns
  drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'scheduled', 'running', 'sending', 'completed', 'sent', 'cancelled', 'failed'));

-- 3. Buat tabel campaign_recipients untuk antrean persisten dan audit per penerima
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text not null,
  name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'delivered', 'failed', 'skipped')),
  baileys_message_id text,
  error_message text,
  retry_count integer not null default 0,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_recipients_campaign_phone_unique unique (campaign_id, phone)
);

-- 4. Indeks performa untuk worker scheduler dan filter query
create index if not exists campaign_recipients_org_status_idx
  on public.campaign_recipients(organization_id, status);

create index if not exists campaign_recipients_campaign_status_idx
  on public.campaign_recipients(campaign_id, status);

create index if not exists campaign_recipients_queue_idx
  on public.campaign_recipients(status, scheduled_at);

-- 5. Row Level Security (RLS) untuk campaign_recipients
alter table public.campaign_recipients enable row level security;

-- Policy Select: Anggota organisasi dapat melihat daftar penerima
drop policy if exists campaign_recipients_read_members on public.campaign_recipients;
create policy campaign_recipients_read_members
on public.campaign_recipients for select to authenticated
using (private.is_org_member(organization_id));

-- Policy Insert: Hanya Owner atau Admin yang berhak memasukkan penerima kampanye
drop policy if exists campaign_recipients_insert_admin on public.campaign_recipients;
create policy campaign_recipients_insert_admin
on public.campaign_recipients for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaign_recipients.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- Policy Update: Hanya Owner atau Admin yang berhak memperbarui status penerima
drop policy if exists campaign_recipients_update_admin on public.campaign_recipients;
create policy campaign_recipients_update_admin
on public.campaign_recipients for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaign_recipients.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaign_recipients.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- Policy Delete: Hanya Owner atau Admin yang berhak menghapus data penerima
drop policy if exists campaign_recipients_delete_admin on public.campaign_recipients;
create policy campaign_recipients_delete_admin
on public.campaign_recipients for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaign_recipients.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- 6. Hak Akses tabel
grant select, insert, update, delete on public.campaign_recipients to authenticated;
