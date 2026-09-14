-- ============================ WORKSPACE ADMIN PERMISSIONS ============================
INSERT INTO public.workspace_permissions (permission_key, app_key, action_key, description) VALUES
  ('workspace.team.view',   'workspace', 'team.view',   'View workspace members and invitations'),
  ('workspace.team.invite', 'workspace', 'team.invite', 'Invite new members to the workspace'),
  ('workspace.team.manage', 'workspace', 'team.manage', 'Manage workspace members and invitations'),
  ('workspace.roles.assign','workspace', 'roles.assign','Assign workspace roles to members')
ON CONFLICT (permission_key) DO NOTHING;

-- Owner and Administrator receive the workspace administration permissions.
INSERT INTO public.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.workspace_roles r
CROSS JOIN public.workspace_permissions p
WHERE r.workspace_id IS NULL
  AND r.role_key IN ('owner','administrator')
  AND p.app_key = 'workspace'
ON CONFLICT DO NOTHING;

-- ============================ INVITATIONS ============================
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resend_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invitations_status_check
    CHECK (status IN ('pending','accepted','expired','cancelled'))
);

-- One live pending invitation per workspace + normalized email.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_pending_unique
  ON public.workspace_invitations (workspace_id, email) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_token_unique
  ON public.workspace_invitations (token_hash);
CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_idx
  ON public.workspace_invitations (workspace_id, status);

GRANT SELECT ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
REVOKE ALL ON public.workspace_invitations FROM anon;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Members with team-view authority may read their own workspace's invitations.
-- No INSERT/UPDATE/DELETE policy exists: mutations happen only through the
-- protected server routines below, which run as the service role.
DROP POLICY IF EXISTS "Team viewers read workspace invitations" ON public.workspace_invitations;
CREATE POLICY "Team viewers read workspace invitations" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_workspace_permission(workspace_id, auth.uid(), 'workspace.team.view')
    OR public.has_role(auth.uid(),'super_admin')
  );

DROP TRIGGER IF EXISTS workspace_invitations_set_updated_at ON public.workspace_invitations;
CREATE TRIGGER workspace_invitations_set_updated_at BEFORE UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ TEAM AUDIT LOG ============================
CREATE TABLE IF NOT EXISTS public.team_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,
  action text NOT NULL,
  role_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_audit_log_workspace_idx
  ON public.team_audit_log (workspace_id, created_at DESC);

GRANT SELECT ON public.team_audit_log TO authenticated;
GRANT ALL ON public.team_audit_log TO service_role;
REVOKE ALL ON public.team_audit_log FROM anon;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team viewers read team audit" ON public.team_audit_log;
CREATE POLICY "Team viewers read team audit" ON public.team_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_workspace_permission(workspace_id, auth.uid(), 'workspace.team.view')
    OR public.has_role(auth.uid(),'super_admin')
  );

-- ============================ NEW-USER PROVISIONING ============================
-- Server-side/database provisioning: profile + workspace + Owner membership +
-- manage app access. Fully idempotent through ON CONFLICT guards.
CREATE OR REPLACE FUNCTION public.provision_user_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_id uuid;
  owner_role uuid;
  membership uuid;
  ws_name text;
BEGIN
  SELECT m.workspace_id INTO ws_id
  FROM public.workspace_memberships m
  JOIN public.workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = _user_id AND w.owner_user_id = _user_id
  LIMIT 1;

  IF ws_id IS NULL THEN
    SELECT w.id INTO ws_id FROM public.workspaces w
    WHERE w.owner_user_id = _user_id ORDER BY w.created_at LIMIT 1;
  END IF;

  IF ws_id IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.organisation), ''), NULLIF(btrim(p.full_name), ''), 'My Workspace')
      INTO ws_name
    FROM public.profiles p WHERE p.id = _user_id;
    ws_name := COALESCE(ws_name, 'My Workspace');

    INSERT INTO public.workspaces (name, owner_user_id, status)
    VALUES (ws_name, _user_id, 'active')
    RETURNING id INTO ws_id;

    UPDATE public.workspaces
       SET slug = 'ws-' || replace(ws_id::text, '-', '')
     WHERE id = ws_id AND slug IS NULL;
  END IF;

  SELECT id INTO owner_role FROM public.workspace_roles
   WHERE workspace_id IS NULL AND role_key = 'owner' LIMIT 1;
  IF owner_role IS NULL THEN RETURN ws_id; END IF;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role_id, status, joined_at)
  VALUES (ws_id, _user_id, owner_role, 'active', now())
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  SELECT id INTO membership FROM public.workspace_memberships
   WHERE workspace_id = ws_id AND user_id = _user_id LIMIT 1;

  INSERT INTO public.workspace_member_app_access (membership_id, app_key, access_level)
  SELECT membership, p.app_key, 'manage'
    FROM (SELECT DISTINCT app_key FROM public.workspace_permissions WHERE app_key <> 'workspace') p
  ON CONFLICT (membership_id, app_key) DO NOTHING;

  -- Any entitlement that already exists for this user is linked to the workspace.
  UPDATE public.access_entitlements
     SET workspace_id = ws_id
   WHERE user_id = _user_id AND workspace_id IS NULL;

  RETURN ws_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_workspace(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organisation, country)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'organisation',
    NEW.raw_user_meta_data ->> 'country'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') INTO is_first;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'super_admin'::public.app_role ELSE 'member'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Workspace + Owner membership + app access. Never fails signup.
  BEGIN
    PERFORM public.provision_user_workspace(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'workspace provisioning deferred for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ============================ ATOMIC INVITATION CREATION ============================
-- `_total_seats` is supplied by the single TypeScript seat calculation
-- (getSeatAccounting); this routine only enforces it atomically.
CREATE OR REPLACE FUNCTION public.create_workspace_invitation(
  _workspace_id uuid,
  _email text,
  _role_id uuid,
  _invited_by uuid,
  _token_hash text,
  _expires_at timestamptz,
  _display_name text,
  _total_seats integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used integer;
  pending integer;
  inv_id uuid;
BEGIN
  -- Serialize every seat decision for this workspace.
  PERFORM pg_advisory_xact_lock(hashtext('ws-seat:' || _workspace_id::text));

  -- Lazily expire stale pending invitations so they release their seat.
  UPDATE public.workspace_invitations
     SET status = 'expired'
   WHERE workspace_id = _workspace_id AND status = 'pending' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.workspace_id = _workspace_id AND m.status = 'active' AND lower(p.email) = _email
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_invitations
    WHERE workspace_id = _workspace_id AND email = _email AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'duplicate_invitation';
  END IF;

  SELECT count(*) INTO used FROM public.workspace_memberships
   WHERE workspace_id = _workspace_id AND status = 'active';
  SELECT count(*) INTO pending FROM public.workspace_invitations
   WHERE workspace_id = _workspace_id AND status = 'pending' AND expires_at > now();

  IF (used + pending) >= _total_seats THEN
    RAISE EXCEPTION 'no_seat_available';
  END IF;

  INSERT INTO public.workspace_invitations
    (workspace_id, email, display_name, role_id, invited_by, token_hash, expires_at)
  VALUES (_workspace_id, _email, _display_name, _role_id, _invited_by, _token_hash, _expires_at)
  RETURNING id INTO inv_id;

  RETURN inv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_invitation(uuid,text,uuid,uuid,text,timestamptz,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_invitation(uuid,text,uuid,uuid,text,timestamptz,text,integer)
  TO service_role;

-- ============================ ATOMIC ACCEPTANCE ============================
-- `_app_access` is a jsonb object of app_key -> access_level, already narrowed
-- server-side to the apps the workspace subscription includes.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
  _token_hash text,
  _user_id uuid,
  _email text,
  _total_seats integer,
  _app_access jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.workspace_invitations;
  ws public.workspaces;
  used integer;
  pending integer;
  membership uuid;
  role_key text;
BEGIN
  SELECT * INTO inv FROM public.workspace_invitations WHERE token_hash = _token_hash;
  IF inv.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ws-seat:' || inv.workspace_id::text));
  SELECT * INTO inv FROM public.workspace_invitations WHERE id = inv.id FOR UPDATE;

  IF inv.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted'); END IF;
  IF inv.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'cancelled'); END IF;
  IF inv.status <> 'pending' OR inv.expires_at <= now() THEN
    UPDATE public.workspace_invitations SET status = 'expired'
     WHERE id = inv.id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF lower(inv.email) <> lower(_email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;

  SELECT * INTO ws FROM public.workspaces WHERE id = inv.workspace_id;
  IF ws.id IS NULL OR ws.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'workspace_unavailable');
  END IF;

  SELECT r.role_key INTO role_key FROM public.workspace_roles r WHERE r.id = inv.role_id;
  IF role_key IS NULL OR role_key = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_role');
  END IF;

  -- Already an active member: resolve the invitation, consume no extra seat.
  SELECT id INTO membership FROM public.workspace_memberships
   WHERE workspace_id = inv.workspace_id AND user_id = _user_id AND status = 'active';
  IF membership IS NOT NULL THEN
    UPDATE public.workspace_invitations
       SET status = 'accepted', accepted_at = now(), accepted_by_user_id = _user_id
     WHERE id = inv.id;
    RETURN jsonb_build_object('ok', true, 'already_member', true,
      'workspace_id', inv.workspace_id, 'workspace_name', ws.name, 'role_key', role_key);
  END IF;

  SELECT count(*) INTO used FROM public.workspace_memberships
   WHERE workspace_id = inv.workspace_id AND status = 'active';
  SELECT count(*) INTO pending FROM public.workspace_invitations
   WHERE workspace_id = inv.workspace_id AND status = 'pending'
     AND expires_at > now() AND id <> inv.id;

  IF (used + pending) >= _total_seats THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_seat_available');
  END IF;

  INSERT INTO public.workspace_memberships
    (workspace_id, user_id, role_id, status, joined_at, invited_by)
  VALUES (inv.workspace_id, _user_id, inv.role_id, 'active', now(), inv.invited_by)
  ON CONFLICT (workspace_id, user_id)
    DO UPDATE SET status = 'active', role_id = inv.role_id, joined_at = now()
  RETURNING id INTO membership;

  INSERT INTO public.workspace_member_app_access (membership_id, app_key, access_level)
  SELECT membership, kv.key, kv.value #>> '{}'
    FROM jsonb_each(COALESCE(_app_access, '{}'::jsonb)) kv
  ON CONFLICT (membership_id, app_key)
    DO UPDATE SET access_level = EXCLUDED.access_level;

  UPDATE public.workspace_invitations
     SET status = 'accepted', accepted_at = now(), accepted_by_user_id = _user_id
   WHERE id = inv.id;

  INSERT INTO public.team_audit_log
    (workspace_id, actor_user_id, target_user_id, target_email, action, role_key, details)
  VALUES (inv.workspace_id, _user_id, _user_id, inv.email, 'invitation_accepted', role_key,
          jsonb_build_object('invitation_id', inv.id)),
         (inv.workspace_id, _user_id, _user_id, inv.email, 'membership_created', role_key,
          jsonb_build_object('membership_id', membership));

  RETURN jsonb_build_object('ok', true, 'already_member', false,
    'workspace_id', inv.workspace_id, 'workspace_name', ws.name, 'role_key', role_key);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text,uuid,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text,uuid,text,integer,jsonb)
  TO service_role;
