-- ============================== WORKSPACES ==============================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_status_check CHECK (status IN ('active','suspended','archived'))
);
GRANT SELECT ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- ============================== ROLES ==============================
CREATE TABLE IF NOT EXISTS public.workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_protected boolean NOT NULL DEFAULT false,
  rank smallint NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_roles_system_key
  ON public.workspace_roles (role_key) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_roles_custom_key
  ON public.workspace_roles (workspace_id, role_key) WHERE workspace_id IS NOT NULL;
GRANT SELECT ON public.workspace_roles TO authenticated;
GRANT ALL ON public.workspace_roles TO service_role;
ALTER TABLE public.workspace_roles ENABLE ROW LEVEL SECURITY;

-- ============================== PERMISSIONS ==============================
CREATE TABLE IF NOT EXISTS public.workspace_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  app_key text NOT NULL,
  action_key text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_permissions TO authenticated;
GRANT ALL ON public.workspace_permissions TO service_role;
ALTER TABLE public.workspace_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.workspace_role_permissions (
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.workspace_permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
GRANT SELECT ON public.workspace_role_permissions TO authenticated;
GRANT ALL ON public.workspace_role_permissions TO service_role;
ALTER TABLE public.workspace_role_permissions ENABLE ROW LEVEL SECURITY;

-- ============================== MEMBERSHIPS ==============================
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id),
  status text NOT NULL DEFAULT 'active',
  joined_at timestamptz,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_status_check
    CHECK (status IN ('active','suspended','removed')),
  CONSTRAINT workspace_memberships_unique UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_memberships_user_idx
  ON public.workspace_memberships (user_id, status);
GRANT SELECT ON public.workspace_memberships TO authenticated;
GRANT ALL ON public.workspace_memberships TO service_role;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

-- ============================== MEMBER APP ACCESS ==============================
CREATE TABLE IF NOT EXISTS public.workspace_member_app_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.workspace_memberships(id) ON DELETE CASCADE,
  app_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'no_access',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_member_app_access_level_check
    CHECK (access_level IN ('no_access','view','edit','manage')),
  CONSTRAINT workspace_member_app_access_unique UNIQUE (membership_id, app_key)
);
GRANT SELECT ON public.workspace_member_app_access TO authenticated;
GRANT ALL ON public.workspace_member_app_access TO service_role;
ALTER TABLE public.workspace_member_app_access ENABLE ROW LEVEL SECURITY;

-- ============================== updated_at triggers ==============================
DROP TRIGGER IF EXISTS workspaces_set_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS workspace_roles_set_updated_at ON public.workspace_roles;
CREATE TRIGGER workspace_roles_set_updated_at BEFORE UPDATE ON public.workspace_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS workspace_memberships_set_updated_at ON public.workspace_memberships;
CREATE TRIGGER workspace_memberships_set_updated_at BEFORE UPDATE ON public.workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS workspace_member_app_access_set_updated_at ON public.workspace_member_app_access;
CREATE TRIGGER workspace_member_app_access_set_updated_at BEFORE UPDATE ON public.workspace_member_app_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================== HELPER FUNCTIONS ==============================
-- Security definer so RLS on memberships cannot recurse. Each function refuses to
-- answer about a user other than the caller when a session is present.
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id
        AND m.status <> 'removed'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.workspace_memberships m
      WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id
        AND m.status = 'active'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(_workspace_id uuid, _user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN NULL
    ELSE (
      SELECT r.role_key FROM public.workspace_memberships m
      JOIN public.workspace_roles r ON r.id = m.role_id
      WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id
        AND m.status = 'active'
      LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  _workspace_id uuid, _user_id uuid, _permission_key text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.workspace_memberships m
      JOIN public.workspace_roles r ON r.id = m.role_id
      WHERE m.workspace_id = _workspace_id
        AND m.user_id = _user_id
        AND m.status = 'active'
        AND (
          r.role_key = 'owner'
          OR EXISTS (
            SELECT 1 FROM public.workspace_role_permissions rp
            JOIN public.workspace_permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = r.id AND p.permission_key = _permission_key
          )
        )
    )
  END;
$$;

-- ============================== RLS POLICIES ==============================
DROP POLICY IF EXISTS "Members view their workspaces" ON public.workspaces;
CREATE POLICY "Members view their workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Members view workspace memberships" ON public.workspace_memberships;
CREATE POLICY "Members view workspace memberships" ON public.workspace_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_active_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'super_admin')
  );

DROP POLICY IF EXISTS "Read system and own workspace roles" ON public.workspace_roles;
CREATE POLICY "Read system and own workspace roles" ON public.workspace_roles
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL
    OR public.is_active_workspace_member(workspace_id, auth.uid())
    OR public.has_role(auth.uid(),'super_admin')
  );

DROP POLICY IF EXISTS "Read permission catalogue" ON public.workspace_permissions;
CREATE POLICY "Read permission catalogue" ON public.workspace_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read role permissions" ON public.workspace_role_permissions;
CREATE POLICY "Read role permissions" ON public.workspace_role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Members view app access" ON public.workspace_member_app_access;
CREATE POLICY "Members view app access" ON public.workspace_member_app_access
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.id = membership_id
      AND (
        m.user_id = auth.uid()
        OR public.is_active_workspace_member(m.workspace_id, auth.uid())
        OR public.has_role(auth.uid(),'super_admin')
      )
  ));
-- No INSERT/UPDATE/DELETE policies anywhere above: every mutation is reserved for
-- protected server actions running with the service role.

-- ============================== SEED SYSTEM ROLES ==============================
INSERT INTO public.workspace_roles (workspace_id, role_key, name, description, is_system, is_protected, rank)
VALUES
  (NULL,'owner','Owner','Full authority over the workspace, team, billing and settings.',true,true,10),
  (NULL,'administrator','Administrator','Manages team members and workspace settings, except ownership and subscription authority.',true,true,20),
  (NULL,'manager','Manager','Operational authority across assigned applications.',true,true,30),
  (NULL,'staff','Staff','Creates and edits operational records in assigned applications.',true,true,40),
  (NULL,'viewer','Viewer','Read-only access to assigned applications.',true,true,50),
  (NULL,'auditor','Auditor','Read-only access with reporting and export rights.',true,true,60)
ON CONFLICT (role_key) WHERE workspace_id IS NULL DO NOTHING;

-- ============================== SEED PERMISSIONS ==============================
INSERT INTO public.workspace_permissions (permission_key, app_key, action_key, description)
SELECT app || '.' || action, app, action,
       initcap(replace(action,'_',' ')) || ' in ' || initcap(app)
FROM (
  VALUES
    ('catalog','access'),('catalog','view'),('catalog','create'),('catalog','edit'),
    ('catalog','delete'),('catalog','export'),('catalog','manage'),
    ('splits','access'),('splits','view'),('splits','create'),('splits','edit'),
    ('splits','edit_shares'),('splits','approve'),('splits','export'),('splits','manage'),
    ('operations','access'),('operations','view'),('operations','create'),('operations','edit'),
    ('operations','delete'),('operations','assign'),('operations','approve'),
    ('operations','export'),('operations','manage'),
    ('finance','access'),('finance','view'),('finance','create'),('finance','edit'),
    ('finance','post'),('finance','approve'),('finance','delete'),('finance','export'),('finance','manage'),
    ('invoice','access'),('invoice','view'),('invoice','create'),('invoice','edit'),
    ('invoice','send'),('invoice','void'),('invoice','delete'),('invoice','export'),('invoice','manage')
) AS t(app, action)
ON CONFLICT (permission_key) DO NOTHING;

-- ============================== DEFAULT ROLE MAPPINGS ==============================
-- Owner is resolved as full access in code and in has_workspace_permission, and is
-- also mapped explicitly so the stored model stays self-describing.
INSERT INTO public.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.workspace_roles r
JOIN public.workspace_permissions p ON true
WHERE r.workspace_id IS NULL
  AND (
    (r.role_key IN ('owner','administrator'))
    OR (r.role_key = 'manager' AND p.action_key IN
        ('access','view','create','edit','edit_shares','export','assign','approve','post','send','manage'))
    OR (r.role_key = 'staff' AND p.action_key IN ('access','view','create','edit'))
    OR (r.role_key = 'viewer' AND p.action_key IN ('access','view'))
    OR (r.role_key = 'auditor' AND p.action_key IN ('access','view','export'))
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================== ENTITLEMENT LINK ==============================
ALTER TABLE public.access_entitlements
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- ============================== IDEMPOTENT BACKFILL ==============================
-- One personal workspace per existing profile, owner membership, full app access.
INSERT INTO public.workspaces (name, slug, owner_user_id, status)
SELECT
  COALESCE(NULLIF(btrim(pr.organisation),''), NULLIF(btrim(pr.full_name),''), 'My Workspace'),
  'ws-' || replace(pr.id::text,'-',''),
  pr.id,
  'active'
FROM public.profiles pr
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspaces w WHERE w.owner_user_id = pr.id
);

INSERT INTO public.workspace_memberships (workspace_id, user_id, role_id, status, joined_at)
SELECT w.id, w.owner_user_id,
       (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND role_key='owner'),
       'active', COALESCE(w.created_at, now())
FROM public.workspaces w
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO public.workspace_member_app_access (membership_id, app_key, access_level)
SELECT m.id, a.app_key, 'manage'
FROM public.workspace_memberships m
JOIN public.workspace_roles r ON r.id = m.role_id AND r.role_key = 'owner'
CROSS JOIN (VALUES ('catalog'),('splits'),('operations'),('finance'),('invoice')) AS a(app_key)
ON CONFLICT (membership_id, app_key) DO NOTHING;

UPDATE public.access_entitlements e
SET workspace_id = w.id
FROM public.workspaces w
WHERE w.owner_user_id = e.user_id AND e.workspace_id IS NULL;