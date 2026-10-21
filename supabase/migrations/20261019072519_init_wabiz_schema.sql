
-- WABiz local development schema
-- This migration is intended for the local Supabase database.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;

-- 1. Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Organization memberships
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- 3. Contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  labels text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone)
);

-- 4. Team members
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text,
  department text,
  role text not null default 'agent',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid references public.team_members(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

-- 6. Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  sender_type text not null
    check (sender_type in ('customer', 'agent', 'bot', 'system')),
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint messages_conversation_org_fk
    foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade
);

-- 7. Campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  message_body text not null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index organization_members_user_idx
  on public.organization_members(user_id);
create index contacts_org_idx
  on public.contacts(organization_id);
create index team_members_org_idx
  on public.team_members(organization_id);
create index conversations_org_status_idx
  on public.conversations(organization_id, status);
create index conversations_contact_idx
  on public.conversations(contact_id);
create index messages_conversation_created_idx
  on public.messages(conversation_id, created_at);
create index messages_org_idx
  on public.messages(organization_id);
create index campaigns_org_idx
  on public.campaigns(organization_id);

-- Membership helper. SECURITY DEFINER avoids RLS recursion.
create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = (select auth.uid())
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.is_org_member(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;

-- Create an organization and its owner membership atomically.
create or replace function public.create_organization_for_current_user(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  clean_name text;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  clean_name := trim(org_name);

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if clean_name is null or char_length(clean_name) < 1
     or char_length(clean_name) > 120 then
    raise exception 'Organization name must be between 1 and 120 characters';
  end if;

  insert into public.organizations (name)
  values (clean_name)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization_for_current_user(text)
  from public, anon;
grant execute on function public.create_organization_for_current_user(text)
  to authenticated;

-- Enable RLS on all application tables.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.contacts enable row level security;
alter table public.team_members enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.campaigns enable row level security;

-- Organizations: members can read their organizations.
create policy organizations_read_members
on public.organizations for select to authenticated
using (private.is_org_member(id));

-- Memberships: users can read their own membership rows.
create policy members_read_own_memberships
on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

-- Contacts: all organization members can manage contacts.
create policy contacts_read_members
on public.contacts for select to authenticated
using (private.is_org_member(organization_id));

create policy contacts_insert_members
on public.contacts for insert to authenticated
with check (private.is_org_member(organization_id));

create policy contacts_update_members
on public.contacts for update to authenticated
using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

create policy contacts_delete_members
on public.contacts for delete to authenticated
using (private.is_org_member(organization_id));

-- Team: members can read; only owner/admin can mutate.
create policy team_members_read_org
on public.team_members for select to authenticated
using (private.is_org_member(organization_id));

create policy team_members_insert_admin
on public.team_members for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = team_members.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy team_members_update_admin
on public.team_members for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = team_members.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = team_members.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy team_members_delete_admin
on public.team_members for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = team_members.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- Conversations: organization members can manage conversations.
create policy conversations_read_members
on public.conversations for select to authenticated
using (private.is_org_member(organization_id));

create policy conversations_insert_members
on public.conversations for insert to authenticated
with check (private.is_org_member(organization_id));

create policy conversations_update_members
on public.conversations for update to authenticated
using (private.is_org_member(organization_id))
with check (private.is_org_member(organization_id));

create policy conversations_delete_members
on public.conversations for delete to authenticated
using (private.is_org_member(organization_id));

-- Messages: members can read and add messages.
create policy messages_read_members
on public.messages for select to authenticated
using (private.is_org_member(organization_id));

create policy messages_insert_members
on public.messages for insert to authenticated
with check (private.is_org_member(organization_id));

-- Campaigns: members can read; only owner/admin can mutate.
create policy campaigns_read_members
on public.campaigns for select to authenticated
using (private.is_org_member(organization_id));

create policy campaigns_insert_admin
on public.campaigns for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaigns.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy campaigns_update_admin
on public.campaigns for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaigns.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaigns.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

create policy campaigns_delete_admin
on public.campaigns for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = campaigns.organization_id
      and om.user_id = (select auth.uid())
      and om.role in ('owner', 'admin')
  )
);

-- Table privileges for Supabase authenticated clients.
grant select on public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on
  public.contacts, public.team_members, public.conversations,
  public.campaigns to authenticated;
grant select, insert on public.messages to authenticated;

commit;
