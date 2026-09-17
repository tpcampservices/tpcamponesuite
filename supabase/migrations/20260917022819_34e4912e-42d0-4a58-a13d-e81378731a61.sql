INSERT INTO public.workspace_permissions (permission_key, app_key, action_key, description)
VALUES ('splits.delete', 'splits', 'delete', 'Permanently delete Splits records')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.workspace_roles r
CROSS JOIN public.workspace_permissions p
WHERE r.workspace_id IS NULL
  AND r.role_key IN ('owner', 'administrator')
  AND p.permission_key = 'splits.delete'
ON CONFLICT DO NOTHING;

DELETE FROM public.workspace_role_permissions rp
USING public.workspace_roles r, public.workspace_permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.workspace_id IS NULL
  AND r.role_key = 'manager'
  AND p.permission_key = 'splits.manage';