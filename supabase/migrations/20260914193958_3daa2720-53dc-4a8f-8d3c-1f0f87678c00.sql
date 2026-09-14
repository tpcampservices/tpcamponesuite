-- Anonymous visitors never need any of these helpers.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_tier_access(uuid, smallint) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_active_workspace_member(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.get_workspace_role(uuid, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, uuid, text) FROM anon, public;

-- Trigger functions run as the table owner / service role only.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- Signed-in users must be able to evaluate the helpers referenced by RLS policies
-- and by the authorization resolver; each helper already refuses to answer about
-- any user other than the caller.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tier_access(uuid, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, uuid, text) TO authenticated, service_role;