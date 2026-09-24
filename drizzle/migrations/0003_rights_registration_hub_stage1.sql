-- Rights Registration Hub (Stage 1 shared framework). Registration-only data.
-- Catalog/Split Sheets values arrive as immutable source snapshots; they are never edited here.

CREATE OR REPLACE FUNCTION public.can_read_registrations(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_workspace_member(_workspace_id, _user_id) AND (
    public.has_workspace_permission(_workspace_id, _user_id, 'splits.registration.prepare')
    OR public.has_workspace_permission(_workspace_id, _user_id, 'splits.registration.approve')
    OR public.has_workspace_permission(_workspace_id, _user_id, 'splits.registration.submit')
    OR public.has_workspace_permission(_workspace_id, _user_id, 'splits.registration.admin'))
$$;

CREATE OR REPLACE FUNCTION public.registration_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Registration history is immutable (%).', TG_TABLE_NAME;
END $$;

-- 1. Immutable source snapshots received from Catalog / Split Sheets
CREATE TABLE public.registration_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  source_app text NOT NULL CHECK (source_app IN ('catalog','splits')),
  entity_type text NOT NULL,
  source_entity_id text NOT NULL,
  work_uid text,
  source_revision text,
  ownership_revision text,
  source_event_id text,
  payload jsonb NOT NULL,
  checksum text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_app, entity_type, source_entity_id, checksum)
);
CREATE INDEX ON public.registration_source_snapshots (workspace_id, work_uid, received_at DESC);

-- 2. Hub works (registration identity keyed by the shared Catalog work_uid)
CREATE TABLE public.registration_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  work_uid text NOT NULL,
  catalog_work_id text,
  split_sheet_id text,
  primary_recording_id text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_source','stale','ready','archived')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, work_uid)
);

-- 3. Party crosswalk
CREATE TABLE public.registration_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  party_type text NOT NULL CHECK (party_type IN ('person','organization')),
  legal_name text NOT NULL,
  first_name text, last_name text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registration_party_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  party_id uuid NOT NULL REFERENCES public.registration_parties(id),
  scheme text NOT NULL CHECK (scheme IN ('ipi_name','ipi_base','isni','cmo_member','catalog_contributor','splits_contributor')),
  value text NOT NULL,
  source_app text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, scheme, value)
);
CREATE TABLE public.registration_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  party_id uuid NOT NULL REFERENCES public.registration_parties(id),
  society_code text NOT NULL,
  right_type text NOT NULL CHECK (right_type IN ('performing','mechanical','synchronization')),
  territory text NOT NULL DEFAULT '2136',
  valid_from date, valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Registration-only rights dimensions (never inferred from ownership %)
CREATE TABLE public.registration_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid NOT NULL REFERENCES public.registration_works(id),
  party_id uuid NOT NULL REFERENCES public.registration_parties(id),
  role_code text NOT NULL,
  controlled boolean,
  pr_ownership numeric(7,4), mr_ownership numeric(7,4), sr_ownership numeric(7,4),
  pr_collection numeric(7,4), mr_collection numeric(7,4), sr_collection numeric(7,4),
  territory text NOT NULL DEFAULT '2136',
  source_snapshot_id uuid REFERENCES public.registration_source_snapshots(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coalesce(pr_ownership,0) BETWEEN 0 AND 100 AND coalesce(mr_ownership,0) BETWEEN 0 AND 100 AND coalesce(sr_ownership,0) BETWEEN 0 AND 100
     AND coalesce(pr_collection,0) BETWEEN 0 AND 100 AND coalesce(mr_collection,0) BETWEEN 0 AND 100 AND coalesce(sr_collection,0) BETWEEN 0 AND 100)
);

-- 5. Agreements, mandates, authority
CREATE TABLE public.registration_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  agreement_type text NOT NULL,
  party_ids uuid[] NOT NULL DEFAULT '{}',
  rights text[] NOT NULL DEFAULT '{}',
  territory text,
  start_date date, end_date date,
  evidence_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registration_authority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  destination text NOT NULL,
  submitting_party_id uuid REFERENCES public.registration_parties(id),
  signer_name text, signer_title text,
  scope text, expires_at date,
  evidence_asset_id uuid,
  verified_by uuid, verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Assets (immutable references with hash)
CREATE TABLE public.registration_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid REFERENCES public.registration_works(id),
  asset_type text NOT NULL,
  storage_path text NOT NULL,
  mime_type text, bytes bigint,
  sha256 text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Immutable URP profiles
CREATE TABLE public.registration_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid NOT NULL REFERENCES public.registration_works(id),
  profile_revision integer NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0',
  catalog_snapshot_id uuid REFERENCES public.registration_source_snapshots(id),
  splits_snapshot_id uuid REFERENCES public.registration_source_snapshots(id),
  catalog_revision text, ownership_revision text,
  urp jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_work_id, profile_revision),
  UNIQUE (registration_work_id, fingerprint)
);
CREATE TABLE public.registration_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  profile_id uuid NOT NULL REFERENCES public.registration_profiles(id),
  destination text NOT NULL DEFAULT 'common',
  passed boolean NOT NULL,
  issues jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Packages, submissions, receipts
CREATE TABLE public.registration_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  profile_id uuid NOT NULL REFERENCES public.registration_profiles(id),
  destination text NOT NULL,
  adapter_version text NOT NULL,
  artifact_asset_id uuid REFERENCES public.registration_assets(id),
  checksum text NOT NULL,
  approved_by uuid, approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, destination, adapter_version, checksum)
);
CREATE TABLE public.registration_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  package_id uuid NOT NULL REFERENCES public.registration_packages(id),
  attempt_number integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('manual','email','portal','sftp','api')),
  idempotency_key text NOT NULL UNIQUE,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  external_reference text,
  response jsonb,
  UNIQUE (package_id, attempt_number)
);
CREATE TABLE public.registration_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  submission_id uuid NOT NULL REFERENCES public.registration_submissions(id),
  receipt_kind text NOT NULL CHECK (receipt_kind IN ('gateway_ack','society_result','manual_note')),
  outcome text NOT NULL,
  external_reference text,
  payload jsonb,
  asset_id uuid REFERENCES public.registration_assets(id),
  recorded_by uuid,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Append-only status history (separate lifecycle states)
CREATE TABLE public.registration_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid NOT NULL REFERENCES public.registration_works(id),
  destination text NOT NULL DEFAULT 'common',
  state text NOT NULL CHECK (state IN ('source_received','profile_built','validated','validation_failed','package_generated','approved','delivered','gateway_acknowledged','society_accepted','society_rejected','writeback_requested','writeback_applied','writeback_rejected','conflict_opened','conflict_resolved')),
  profile_id uuid REFERENCES public.registration_profiles(id),
  package_id uuid REFERENCES public.registration_packages(id),
  submission_id uuid REFERENCES public.registration_submissions(id),
  actor_user_id uuid,
  note text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.registration_status_history (registration_work_id, created_at DESC);

-- 10. Conflicts and guarded write-back requests
CREATE TABLE public.registration_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid NOT NULL REFERENCES public.registration_works(id),
  conflict_type text NOT NULL,
  field_path text NOT NULL,
  source_value jsonb, proposed_value jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by uuid, resolved_at timestamptz, resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.registration_writeback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  registration_work_id uuid NOT NULL REFERENCES public.registration_works(id),
  target_app text NOT NULL CHECK (target_app IN ('catalog','splits')),
  target_entity_id text NOT NULL,
  field_path text NOT NULL,
  expected_current_value jsonb,
  new_value jsonb NOT NULL,
  receipt_id uuid REFERENCES public.registration_receipts(id),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','sent','applied','rejected','conflict')),
  requested_by uuid, reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants, RLS, immutability
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['registration_source_snapshots','registration_works','registration_parties','registration_party_identifiers','registration_affiliations','registration_interests','registration_agreements','registration_authority','registration_assets','registration_profiles','registration_validations','registration_packages','registration_submissions','registration_receipts','registration_status_history','registration_conflicts','registration_writeback_requests'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Registration readers in workspace" ON public.%I FOR SELECT TO authenticated USING (public.can_read_registrations(workspace_id, auth.uid()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['registration_source_snapshots','registration_profiles','registration_validations','registration_submissions','registration_receipts','registration_status_history','registration_assets'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registration_block_mutation()', t || '_immutable', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['registration_works','registration_parties','registration_interests','registration_agreements','registration_authority','registration_conflicts','registration_writeback_requests'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.registration_source_snapshots IS 'Immutable copies of Catalog/Split Sheets data as received. Never an editable master record.';