ALTER TABLE public.plan_orders
  ADD COLUMN IF NOT EXISTS payment_currency text,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_amount_cents integer,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,4),
  ADD COLUMN IF NOT EXISTS quote_fingerprint text,
  ADD COLUMN IF NOT EXISTS merchant_reference text;
ALTER TABLE public.plan_orders ADD CONSTRAINT plan_orders_payment_amount_cents_pos
  CHECK (payment_amount_cents IS NULL OR payment_amount_cents > 0);
ALTER TABLE public.plan_orders ADD CONSTRAINT plan_orders_exchange_rate_pos
  CHECK (exchange_rate IS NULL OR exchange_rate > 0);
CREATE UNIQUE INDEX IF NOT EXISTS plan_orders_merchant_reference_uq
  ON public.plan_orders (merchant_reference) WHERE merchant_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_orders_wam_quote_idx
  ON public.plan_orders (user_id, quote_fingerprint) WHERE payment_provider = 'wam';
COMMENT ON COLUMN public.plan_orders.currency IS 'Authoritative commercial currency (USD). Never overwritten by settlement currency.';
COMMENT ON COLUMN public.plan_orders.payment_amount_cents IS 'Locked settlement amount in minor units, fixed at order creation.';
COMMENT ON COLUMN public.plan_orders.exchange_rate IS 'Locked USD->settlement rate applied at order creation; never recalculated.';

-- Append-only audit of administered WAM checkout rate changes.
CREATE TABLE public.wam_rate_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wam_rate_changes TO service_role;
ALTER TABLE public.wam_rate_changes ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.wam_rate_changes_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'wam_rate_changes is append-only'; END $$;
CREATE TRIGGER wam_rate_changes_no_update BEFORE UPDATE OR DELETE ON public.wam_rate_changes
  FOR EACH ROW EXECUTE FUNCTION public.wam_rate_changes_immutable();

-- Durable record of every verified WAM webhook delivery (service role only).
CREATE TABLE public.wam_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  payment_id text,
  plan_order_id uuid REFERENCES public.plan_orders(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  delivery_count integer NOT NULL DEFAULT 1,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);
GRANT ALL ON public.wam_events TO service_role;
ALTER TABLE public.wam_events ENABLE ROW LEVEL SECURITY;

-- Staging checkout rate (administered; not an official FX rate).
INSERT INTO public.integration_settings (key, value) VALUES ('WAM_USD_TTD_RATE', '6.80')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.wam_rate_changes (setting_key, old_value, new_value, reason)
SELECT 'WAM_USD_TTD_RATE', NULL, '6.80', 'Initial TP-CAMP staging checkout rate (migration)'
WHERE NOT EXISTS (SELECT 1 FROM public.wam_rate_changes WHERE setting_key = 'WAM_USD_TTD_RATE');