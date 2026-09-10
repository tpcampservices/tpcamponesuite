ALTER TABLE public.plan_orders
  ADD COLUMN IF NOT EXISTS captured_amount numeric,
  ADD COLUMN IF NOT EXISTS captured_currency text,
  ADD COLUMN IF NOT EXISTS capture_status text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;