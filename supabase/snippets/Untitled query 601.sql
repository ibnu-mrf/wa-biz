SELECT
  o.name AS organization_name,
  o.id AS organization_id,
  c.name AS contact_name,
  c.organization_id AS contact_organization_id,
  (o.id = c.organization_id) AS organization_matches
FROM public.organizations o
JOIN public.contacts c
  ON c.organization_id = o.id
ORDER BY o.name;