-- Migration: Add registration handoff fields to conversations and phone to team_members
-- Purpose: Support registration CS routing, handoff tracking, and WhatsApp notifications to CS officers.

begin;

-- 1. Add phone column to team_members
alter table public.team_members
  add column if not exists phone text check (phone is null or char_length(trim(phone)) >= 9);

-- 2. Add registration handoff tracking columns to conversations
alter table public.conversations
  add column if not exists handoff_status text not null default 'none'
    check (handoff_status in ('none', 'pending', 'sent', 'failed'));

alter table public.conversations
  add column if not exists handoff_department text;

alter table public.conversations
  add column if not exists handoff_notified_at timestamptz;

alter table public.conversations
  add column if not exists handoff_summary text;

alter table public.conversations
  add column if not exists handoff_error text;

alter table public.conversations
  add column if not exists handoff_cs_phone text;

-- 3. Create index for fast dashboard filtering on handoff status
create index if not exists conversations_org_handoff_idx
  on public.conversations(organization_id, handoff_status);

commit;
