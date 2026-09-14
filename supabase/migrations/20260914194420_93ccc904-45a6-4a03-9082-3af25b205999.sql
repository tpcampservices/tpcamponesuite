REVOKE ALL ON public.workspaces FROM anon, authenticated;
REVOKE ALL ON public.workspace_roles FROM anon, authenticated;
REVOKE ALL ON public.workspace_permissions FROM anon, authenticated;
REVOKE ALL ON public.workspace_role_permissions FROM anon, authenticated;
REVOKE ALL ON public.workspace_memberships FROM anon, authenticated;
REVOKE ALL ON public.workspace_member_app_access FROM anon, authenticated;

GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.workspace_roles TO authenticated;
GRANT SELECT ON public.workspace_permissions TO authenticated;
GRANT SELECT ON public.workspace_role_permissions TO authenticated;
GRANT SELECT ON public.workspace_memberships TO authenticated;
GRANT SELECT ON public.workspace_member_app_access TO authenticated;

GRANT ALL ON public.workspaces TO service_role;
GRANT ALL ON public.workspace_roles TO service_role;
GRANT ALL ON public.workspace_permissions TO service_role;
GRANT ALL ON public.workspace_role_permissions TO service_role;
GRANT ALL ON public.workspace_memberships TO service_role;
GRANT ALL ON public.workspace_member_app_access TO service_role;