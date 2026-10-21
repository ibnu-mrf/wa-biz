
-- Preserve conversations when a contact is deleted.
-- Intended for local Supabase development.

begin;

alter table public.conversations
  drop constraint conversations_contact_org_fk;

alter table public.conversations
  add constraint conversations_contact_org_fk
  foreign key (contact_id, organization_id)
  references public.contacts (id, organization_id)
  on delete set null (contact_id);

commit;
