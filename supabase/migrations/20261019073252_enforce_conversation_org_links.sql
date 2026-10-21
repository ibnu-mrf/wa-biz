
-- Enforce organization consistency for conversation relationships.
-- Intended for local Supabase development.

begin;

-- Add composite unique keys needed by the foreign keys.
alter table public.contacts
  add constraint contacts_id_organization_unique
  unique (id, organization_id);

alter table public.team_members
  add constraint team_members_id_organization_unique
  unique (id, organization_id);

-- Ensure a conversation's contact belongs to its organization.
alter table public.conversations
  add constraint conversations_contact_org_fk
  foreign key (contact_id, organization_id)
  references public.contacts (id, organization_id)
  on delete cascade;

-- Ensure a conversation's assigned team member belongs to its organization.
alter table public.conversations
  add constraint conversations_assigned_to_org_fk
  foreign key (assigned_to, organization_id)
  references public.team_members (id, organization_id)
  on delete set null (assigned_to);

commit;
