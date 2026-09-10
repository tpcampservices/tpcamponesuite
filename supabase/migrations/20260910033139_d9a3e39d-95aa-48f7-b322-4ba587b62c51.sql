CREATE TABLE public.paypal_webhook_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id TEXT,
  event_type TEXT,
  environment TEXT,
  headers_present JSONB,
  http_status INTEGER,
  outcome TEXT NOT NULL DEFAULT 'RECEIVED',
  signature_result TEXT,
  rejection_reason TEXT,
  paypal_debug_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.paypal_webhook_diagnostics TO service_role;
ALTER TABLE public.paypal_webhook_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE INDEX paypal_webhook_diagnostics_received_idx ON public.paypal_webhook_diagnostics (received_at DESC);