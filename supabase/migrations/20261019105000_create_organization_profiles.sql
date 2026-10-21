-- Migration: Create organization_profiles table and RLS policies
-- Purpose: Persist educational institution profile, admissions info, contacts, and FAQs per organization.

begin;

-- 1. Table: public.organization_profiles
create table if not exists public.organization_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  org_name text not null default '',
  short_name text not null default '',
  institution_type text not null default 'Pesantren / Islamic Boarding School',
  official_description text not null default '',
  logo_url text,
  student_count text not null default '',
  staff_count text not null default '',
  escalation_phone text not null default '',
  official_email text not null default '',
  address text not null default '',
  maps_url text not null default '',
  website_url text not null default '',
  registration_url text not null default '',
  info_page_url text not null default '',
  admission_schedule text not null default '',
  tuition_info text not null default '',
  requirements text not null default '',
  admission_contact text not null default '',
  cs_hours text not null default '',
  operational_days text not null default '',
  facilities text not null default '',
  faqs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index on organization_id is automatically created by primary key

-- 2. Enable Row Level Security (RLS)
alter table public.organization_profiles enable row level security;

-- 3. RLS Policies:
-- A. Read: Authenticated members of the organization can view the profile
create policy organization_profiles_read_members
on public.organization_profiles for select to authenticated
using (private.is_org_member(organization_id));

-- B. Insert: Only owner or admin of the organization can insert
create policy organization_profiles_insert_admin
on public.organization_profiles for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_profiles.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- C. Update: Only owner or admin of the organization can update
create policy organization_profiles_update_admin
on public.organization_profiles for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_profiles.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_profiles.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- D. Delete: Only owner or admin of the organization can delete
create policy organization_profiles_delete_admin
on public.organization_profiles for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_profiles.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- 4. Restrict direct table privileges
revoke all on table public.organization_profiles from public, anon;
grant select, insert, update, delete on table public.organization_profiles to authenticated;

commit;
