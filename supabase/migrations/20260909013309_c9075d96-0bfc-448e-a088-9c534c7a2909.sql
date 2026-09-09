CREATE TABLE public.access_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text,
  billing_period text,
  currency text NOT NULL DEFAULT 'USD',
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  seats_extra integer NOT NULL DEFAULT 0,
  access_status text NOT NULL DEFAULT 'none',
  access_start_date timestamptz,
  access_expiry_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.access_entitlements TO authenticated;
GRANT ALL ON public.access_entitlements TO service_role;
ALTER TABLE public.access_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own entitlement" ON public.access_entitlements
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER access_entitlements_set_updated_at BEFORE UPDATE ON public.access_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plan_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  plan_id text NOT NULL,
  billing_period text NOT NULL,
  currency text NOT NULL,
  base_price numeric NOT NULL DEFAULT 0,
  add_on_total numeric NOT NULL DEFAULT 0,
  onboarding_fee numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  paypal_order_id text UNIQUE,
  paypal_capture_id text,
  payment_status text NOT NULL DEFAULT 'created',
  payment_provider text NOT NULL DEFAULT 'paypal',
  access_start_date timestamptz,
  access_expiry_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_orders TO authenticated;
GRANT ALL ON public.plan_orders TO service_role;
ALTER TABLE public.plan_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own orders" ON public.plan_orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER plan_orders_set_updated_at BEFORE UPDATE ON public.plan_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX plan_orders_user_idx ON public.plan_orders(user_id, created_at DESC);

CREATE TABLE public.plan_limit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_key text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric, period_key)
);
GRANT SELECT ON public.plan_limit_usage TO authenticated;
GRANT ALL ON public.plan_limit_usage TO service_role;
ALTER TABLE public.plan_limit_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON public.plan_limit_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER plan_limit_usage_set_updated_at BEFORE UPDATE ON public.plan_limit_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();