ALTER TABLE public.plan_orders
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS plan_orders_provider_reference_uq
  ON public.plan_orders (payment_provider, provider_reference) WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_orders_provider_txn_uq
  ON public.plan_orders (payment_provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE public.paywise_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('notify','callback')),
  environment text NOT NULL DEFAULT 'sandbox',
  event_type text,
  dedupe_key text NOT NULL,
  paywise_reference text,
  onesuite_reference text,
  plan_order_id uuid REFERENCES public.plan_orders(id) ON DELETE SET NULL,
  processing_status text NOT NULL DEFAULT 'logged',
  verification_status text NOT NULL DEFAULT 'not_verified',
  duplicate_count integer NOT NULL DEFAULT 0,
  last_duplicate_at timestamptz,
  error_message text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, dedupe_key)
);
GRANT ALL ON public.paywise_events TO service_role;
ALTER TABLE public.paywise_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX paywise_events_received_idx ON public.paywise_events (received_at DESC);