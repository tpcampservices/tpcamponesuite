CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.crm_contacts DROP CONSTRAINT crm_contacts_status_check;
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_status_check
  CHECK (sync_status = ANY (ARRAY['not_synced','pending','synced','failed','needs_update','blocked']));

CREATE TABLE public.crm_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  payload_hash text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT ON public.crm_sync_queue TO authenticated;
GRANT ALL ON public.crm_sync_queue TO service_role;
ALTER TABLE public.crm_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read CRM queue" ON public.crm_sync_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
-- One open job per user: identical/related events collapse into it.
CREATE UNIQUE INDEX crm_sync_queue_one_open_per_user ON public.crm_sync_queue (user_id)
  WHERE status IN ('pending','failed');
CREATE INDEX crm_sync_queue_due ON public.crm_sync_queue (status, next_attempt_at);
CREATE TRIGGER crm_sync_queue_updated_at BEFORE UPDATE ON public.crm_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
COMMENT ON TABLE public.crm_sync_queue IS 'HubSpot CRM outbound queue. Never an access authority.';

-- Processor endpoint config (service-role only table).
INSERT INTO public.integration_settings (key, value) VALUES
  ('hubspot_auto_sync_enabled', 'false'),
  ('crm_processor_url', 'https://project--78e0852d-a4cf-409c-9124-a9a045dc4411.lovable.app/api/public/crm/process'),
  ('crm_processor_token', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.crm_wake_processor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text; _tok text;
BEGIN
  SELECT value INTO _url FROM integration_settings WHERE key = 'crm_processor_url';
  SELECT value INTO _tok FROM integration_settings WHERE key = 'crm_processor_token';
  IF _url IS NULL OR _tok IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := _url,
    headers := jsonb_build_object('content-type','application/json','x-crm-token',_tok),
    body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Enqueue. Never raises: a CRM problem can never fail a TP-CAMP transaction.
CREATE OR REPLACE FUNCTION public.crm_enqueue(_user_id uuid, _event text, _force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inserted boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  IF NOT _force AND COALESCE((SELECT value FROM integration_settings WHERE key='hubspot_auto_sync_enabled'),'false') <> 'true' THEN
    RETURN;
  END IF;
  INSERT INTO crm_sync_queue (user_id, event_type) VALUES (_user_id, _event)
  ON CONFLICT (user_id) WHERE status IN ('pending','failed') DO NOTHING;
  _inserted := FOUND;
  UPDATE crm_contacts SET sync_status = 'needs_update'
    WHERE user_id = _user_id AND sync_status = 'synced';
  IF _inserted AND NOT _force THEN PERFORM crm_wake_processor(); END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.crm_trg_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_enqueue(COALESCE(NEW.id, OLD.id), CASE WHEN TG_OP='INSERT' THEN 'signup' ELSE 'profile_change' END);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER crm_profiles_sync AFTER INSERT OR UPDATE OF full_name, organisation, country, email
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.crm_trg_profile();

CREATE OR REPLACE FUNCTION public.crm_trg_business() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_enqueue(NEW.user_id, 'profile_change');
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER crm_business_sync AFTER INSERT OR UPDATE OF legal_name, trading_name, registration_number, address, contact_phone
  ON public.business_profiles FOR EACH ROW EXECUTE FUNCTION public.crm_trg_business();

-- Entitlement changes affect the owner and every active member of that workspace.
CREATE OR REPLACE FUNCTION public.crm_trg_entitlement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m uuid;
BEGIN
  PERFORM crm_enqueue(NEW.user_id, 'access_change');
  IF NEW.workspace_id IS NOT NULL THEN
    FOR _m IN SELECT user_id FROM workspace_memberships WHERE workspace_id = NEW.workspace_id AND status='active' LOOP
      PERFORM crm_enqueue(_m, 'access_change');
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER crm_entitlement_sync AFTER INSERT OR UPDATE OF plan_id, status, access_status, billing_period,
  subscription_source, payment_status, access_start_date, access_expiry_date, seats_limit, seats_extra, allowed_apps, workspace_id
  ON public.access_entitlements FOR EACH ROW EXECUTE FUNCTION public.crm_trg_entitlement();

CREATE OR REPLACE FUNCTION public.crm_trg_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_enqueue(COALESCE(NEW.user_id, OLD.user_id), 'workspace_change');
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER crm_membership_sync AFTER INSERT OR DELETE OR UPDATE OF status, role_id
  ON public.workspace_memberships FOR EACH ROW EXECUTE FUNCTION public.crm_trg_membership();

CREATE OR REPLACE FUNCTION public.crm_trg_app_access() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM crm_enqueue((SELECT user_id FROM workspace_memberships WHERE id = COALESCE(NEW.membership_id, OLD.membership_id)), 'app_access_change');
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
CREATE TRIGGER crm_app_access_sync AFTER INSERT OR DELETE OR UPDATE OF access_level
  ON public.workspace_member_app_access FOR EACH ROW EXECUTE FUNCTION public.crm_trg_app_access();

-- Date-derived expiry: queue synced contacts whose access expired since their last sync.
CREATE OR REPLACE FUNCTION public.crm_enqueue_expired() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid; _n integer := 0;
BEGIN
  FOR _u IN
    SELECT DISTINCT c.user_id FROM crm_contacts c
    JOIN workspace_memberships m ON m.user_id = c.user_id AND m.status = 'active'
    JOIN access_entitlements e ON e.workspace_id = m.workspace_id
    WHERE c.sync_status = 'synced' AND e.access_expiry_date IS NOT NULL
      AND e.access_expiry_date <= now() AND e.access_expiry_date > COALESCE(c.last_synced_at, '-infinity')
  LOOP
    PERFORM crm_enqueue(_u, 'expiry'); _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- Safe claim with row locking; stale 'processing' rows are reclaimed.
CREATE OR REPLACE FUNCTION public.crm_claim_jobs(_limit integer)
RETURNS SETOF public.crm_sync_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE crm_sync_queue SET status = 'failed', last_error = 'Processor timed out'
    WHERE status = 'processing' AND updated_at < now() - interval '15 minutes';
  RETURN QUERY
  UPDATE crm_sync_queue q SET status = 'processing', attempt_count = q.attempt_count + 1
  WHERE q.id IN (
    SELECT id FROM crm_sync_queue
    WHERE status IN ('pending','failed') AND next_attempt_at <= now()
    ORDER BY next_attempt_at LIMIT GREATEST(1, LEAST(_limit, 50))
    FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END $$;

REVOKE ALL ON FUNCTION public.crm_enqueue(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_wake_processor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_enqueue_expired() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_enqueue(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_enqueue_expired() TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_claim_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_wake_processor() TO service_role;

-- Hourly backstop: retries with backoff + date-based expiry. Cheap no-op when idle.
SELECT cron.schedule('crm-sync-processor', '0 * * * *', $$ SELECT public.crm_wake_processor(); $$);