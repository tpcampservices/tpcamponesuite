-- Restrict SECURITY DEFINER helpers so signed-in users can only probe their own
-- access state; service_role (server-side code) keeps full use.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid()
      THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.has_tier_access(_user_id uuid, _tier smallint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid()
      THEN false
    ELSE public.has_role(_user_id, 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.user_id = _user_id
          AND s.status = 'active'
          AND s.tier >= _tier
          AND (s.expires_at IS NULL OR s.expires_at > now())
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_tier_access(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tier_access(uuid, smallint) TO authenticated, service_role;