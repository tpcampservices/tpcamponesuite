CREATE TABLE public.workspace_member_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.workspace_memberships(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.workspace_permissions(id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, permission_id)
);

CREATE INDEX idx_wmpo_membership ON public.workspace_member_permission_overrides(membership_id);
CREATE INDEX idx_wmpo_workspace ON public.workspace_member_permission_overrides(workspace_id);

GRANT SELECT ON public.workspace_member_permission_overrides TO authenticated;
GRANT ALL ON public.workspace_member_permission_overrides TO service_role;

ALTER TABLE public.workspace_member_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active members can read workspace overrides"
ON public.workspace_member_permission_overrides
FOR SELECT TO authenticated
USING (public.is_active_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER workspace_member_permission_overrides_set_updated_at
BEFORE UPDATE ON public.workspace_member_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The denormalised workspace_id must always equal the membership's workspace.
CREATE OR REPLACE FUNCTION public.enforce_override_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws uuid;
BEGIN
  SELECT workspace_id INTO ws FROM public.workspace_memberships WHERE id = NEW.membership_id;
  IF ws IS NULL OR ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'workspace_membership_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_member_permission_overrides_workspace_integrity
BEFORE INSERT OR UPDATE ON public.workspace_member_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.enforce_override_workspace();

-- New workspace administration permission, mapped to Owner and Administrator only.
INSERT INTO public.workspace_permissions (permission_key, app_key, action_key, description)
VALUES ('workspace.permissions.manage', 'workspace', 'permissions.manage',
        'Manage member-specific permission overrides')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.workspace_roles r
JOIN public.workspace_permissions p ON p.permission_key = 'workspace.permissions.manage'
WHERE r.workspace_id IS NULL AND r.role_key IN ('owner','administrator')
ON CONFLICT DO NOTHING;