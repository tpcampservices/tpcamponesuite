ALTER TABLE public.access_entitlements
  ADD COLUMN IF NOT EXISTS subscription_source text NOT NULL DEFAULT 'paypal',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS seats_limit integer,
  ADD COLUMN IF NOT EXISTS allowed_apps jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS granted_at timestamp with time zone;

UPDATE public.access_entitlements
SET status = CASE
  WHEN access_status = 'active' THEN 'active'
  WHEN access_status = 'expired' THEN 'expired'
  ELSE 'none'
END
WHERE status = 'none';

ALTER TABLE public.access_entitlements
  DROP CONSTRAINT IF EXISTS access_entitlements_subscription_source_check,
  DROP CONSTRAINT IF EXISTS access_entitlements_payment_status_check,
  DROP CONSTRAINT IF EXISTS access_entitlements_status_check;

ALTER TABLE public.access_entitlements
  ADD CONSTRAINT access_entitlements_subscription_source_check
    CHECK (subscription_source IN ('paypal','manual_admin','complimentary','promotional','migration','internal','trial')),
  ADD CONSTRAINT access_entitlements_payment_status_check
    CHECK (payment_status IN ('paid','not_required','pending','failed','refunded')),
  ADD CONSTRAINT access_entitlements_status_check
    CHECK (status IN ('none','active','trial','pending_payment','past_due','suspended','cancelled','expired'));

CREATE TABLE IF NOT EXISTS public.admin_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_workspace text,
  action text NOT NULL DEFAULT 'grant_access',
  old_plan_id text,
  new_plan_id text,
  old_status text,
  new_status text,
  old_subscription_source text,
  new_subscription_source text,
  old_payment_status text,
  new_payment_status text,
  old_expiry_date timestamp with time zone,
  new_expiry_date timestamp with time zone,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_access_audit TO authenticated;
GRANT ALL ON public.admin_access_audit TO service_role;

ALTER TABLE public.admin_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read access audit" ON public.admin_access_audit;
CREATE POLICY "Super admins read access audit"
  ON public.admin_access_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS admin_access_audit_target_idx
  ON public.admin_access_audit (target_user_id, created_at DESC);