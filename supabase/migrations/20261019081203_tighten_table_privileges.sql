-- Remove excessive table privileges from both roles.
REVOKE ALL PRIVILEGES ON TABLE
  public.organizations,
  public.organization_members,
  public.contacts,
  public.team_members,
  public.conversations,
  public.messages,
  public.campaigns
FROM anon, authenticated;

-- No direct table access for unauthenticated users.
-- authenticated receives only the operations needed by the app.
GRANT SELECT ON TABLE
  public.organizations,
  public.organization_members
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.contacts,
  public.team_members,
  public.conversations,
  public.campaigns
TO authenticated;

GRANT SELECT, INSERT ON TABLE
  public.messages
TO authenticated;