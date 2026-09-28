CREATE TABLE public.registration_identities (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  legal_name text NOT NULL CHECK (legal_name = btrim(legal_name) AND char_length(legal_name) BETWEEN 1 AND 200),
  trading_name text NULL CHECK (trading_name IS NULL OR (trading_name = btrim(trading_name) AND char_length(trading_name) BETWEEN 1 AND 200)),
  contact_name text NOT NULL CHECK (contact_name = btrim(contact_name) AND char_length(contact_name) BETWEEN 1 AND 150),
  contact_email text NOT NULL CHECK (contact_email = lower(btrim(contact_email)) AND char_length(contact_email) BETWEEN 3 AND 255 AND contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text NULL CHECK (contact_phone IS NULL OR (contact_phone = btrim(contact_phone) AND contact_phone ~ '^\+?[0-9 ()\-]{5,30}$')),
  address_street text NULL CHECK (address_street IS NULL OR (address_street = btrim(address_street) AND char_length(address_street) BETWEEN 1 AND 300)),
  address_city text NULL CHECK (address_city IS NULL OR (address_city = btrim(address_city) AND char_length(address_city) BETWEEN 1 AND 120)),
  address_country text NOT NULL CHECK (address_country ~ '^[A-Z]{2}$'),
  address_postal_code text NULL CHECK (address_postal_code IS NULL OR (address_postal_code = btrim(address_postal_code) AND char_length(address_postal_code) BETWEEN 1 AND 20)),
  signatory_name text NOT NULL CHECK (signatory_name = btrim(signatory_name) AND char_length(signatory_name) BETWEEN 1 AND 150),
  signatory_title text NOT NULL CHECK (signatory_title = btrim(signatory_title) AND char_length(signatory_title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.registration_identities FROM anon;
GRANT SELECT ON public.registration_identities TO authenticated;
GRANT ALL ON public.registration_identities TO service_role;

ALTER TABLE public.registration_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Registration readers in workspace"
  ON public.registration_identities FOR SELECT TO authenticated
  USING (public.can_read_registrations(workspace_id, auth.uid()));

CREATE TRIGGER registration_identities_set_updated_at
  BEFORE UPDATE ON public.registration_identities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.registration_identities IS 'OneSuite Registration Hub submitting-party identity (one per workspace). Writes only via server functions after Owner/Administrator check.';