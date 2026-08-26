-- 1. Verified PayPal webhook events (idempotency + audit log)
CREATE TABLE public.paypal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  resource_id text,
  subscription_reference text,
  plan_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status text,
  new_status text,
  applied boolean NOT NULL DEFAULT false,
  duplicate boolean NOT NULL DEFAULT false,
  note text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paypal_webhook_events TO authenticated;
GRANT ALL ON public.paypal_webhook_events TO service_role;
ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read webhook events"
ON public.paypal_webhook_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX paypal_webhook_events_created_at_idx ON public.paypal_webhook_events (created_at DESC);
CREATE INDEX paypal_webhook_events_reference_idx ON public.paypal_webhook_events (subscription_reference);

-- 2. PayPal plan id -> tier mapping
CREATE TABLE public.paypal_plans (
  plan_id text PRIMARY KEY,
  tier smallint NOT NULL,
  cycle text NOT NULL CHECK (cycle IN ('monthly','yearly')),
  currency text NOT NULL DEFAULT 'USD',
  amount numeric,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paypal_plans TO authenticated;
GRANT ALL ON public.paypal_plans TO service_role;
ALTER TABLE public.paypal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read plan mapping"
ON public.paypal_plans FOR SELECT TO authenticated USING (true);

CREATE TRIGGER paypal_plans_set_updated_at
BEFORE UPDATE ON public.paypal_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.paypal_plans (plan_id, tier, cycle, currency, amount, label) VALUES
  ('P-23V27230FR240482ENKHVRFQ', 3, 'monthly', 'USD', 49, 'TP-CAMP OneSuite — Monthly'),
  ('P-18U15029U67667611NKHVSOQ', 3, 'yearly', 'USD', 500, 'TP-CAMP OneSuite — Yearly');

-- 3. Server-only integration settings (PayPal credentials)
CREATE TABLE public.integration_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No anon/authenticated grants: this table is reachable only by server-side code.
GRANT ALL ON public.integration_settings TO service_role;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER integration_settings_set_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();