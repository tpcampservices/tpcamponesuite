CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  crm_provider text NOT NULL DEFAULT 'hubspot',
  external_contact_id text,
  normalized_email text,
  sync_status text NOT NULL DEFAULT 'not_synced',
  last_synced_at timestamptz,
  last_attempted_at timestamptz,
  sync_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_provider_check CHECK (crm_provider IN ('hubspot')),
  CONSTRAINT crm_contacts_status_check CHECK (sync_status IN ('not_synced','pending','synced','failed','needs_update')),
  CONSTRAINT crm_contacts_attempts_check CHECK (sync_attempts >= 0),
  CONSTRAINT crm_contacts_user_provider_key UNIQUE (user_id, crm_provider)
);
CREATE UNIQUE INDEX crm_contacts_provider_external_key ON public.crm_contacts (crm_provider, external_contact_id) WHERE external_contact_id IS NOT NULL;
CREATE INDEX crm_contacts_status_idx ON public.crm_contacts (crm_provider, sync_status);
CREATE INDEX crm_contacts_email_idx ON public.crm_contacts (crm_provider, normalized_email);

GRANT SELECT ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read CRM contacts" ON public.crm_contacts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER crm_contacts_updated_at BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.crm_contacts IS 'CRM mapping/sync state only. Never an access authority: nothing here may grant or revoke TP-CAMP access.';

-- Security: permission catalogue reads restricted (all app reads are server-side).
DROP POLICY IF EXISTS "Read permission catalogue" ON public.workspace_permissions;
CREATE POLICY "Read permission catalogue" ON public.workspace_permissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Read role permissions" ON public.workspace_role_permissions;
CREATE POLICY "Read role permissions" ON public.workspace_role_permissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));