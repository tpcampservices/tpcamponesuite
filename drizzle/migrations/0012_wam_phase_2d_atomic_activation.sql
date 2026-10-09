-- Atomic, idempotent activation for non-PayPal providers. All three writes
-- commit together or not at all; a paid order is never applied twice.
CREATE OR REPLACE FUNCTION public.apply_paid_order_atomic(
  _order_id uuid, _provider text, _entitlement jsonb, _order_update jsonb, _subscription jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _o public.plan_orders%ROWTYPE;
BEGIN
  SELECT * INTO _o FROM public.plan_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF _o.payment_status = 'paid' THEN RETURN 'duplicate'; END IF;
  IF _o.payment_provider IS DISTINCT FROM _provider OR _provider = 'paypal' THEN
    RAISE EXCEPTION 'provider_mismatch';
  END IF;

  INSERT INTO public.access_entitlements AS e (
    user_id, workspace_id, plan_id, billing_period, currency, addons, seats_extra,
    access_status, status, subscription_source, payment_status, access_start_date, access_expiry_date)
  VALUES (
    (_entitlement->>'user_id')::uuid, NULLIF(_entitlement->>'workspace_id','')::uuid,
    _entitlement->>'plan_id', _entitlement->>'billing_period', _entitlement->>'currency',
    COALESCE(_entitlement->'addons','[]'::jsonb), COALESCE((_entitlement->>'seats_extra')::int,0),
    _entitlement->>'access_status', _entitlement->>'status', _entitlement->>'subscription_source',
    _entitlement->>'payment_status', (_entitlement->>'access_start_date')::timestamptz,
    (_entitlement->>'access_expiry_date')::timestamptz)
  ON CONFLICT (user_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id, plan_id = EXCLUDED.plan_id,
    billing_period = EXCLUDED.billing_period, currency = EXCLUDED.currency,
    addons = EXCLUDED.addons, seats_extra = EXCLUDED.seats_extra,
    access_status = EXCLUDED.access_status, status = EXCLUDED.status,
    subscription_source = EXCLUDED.subscription_source, payment_status = EXCLUDED.payment_status,
    access_start_date = EXCLUDED.access_start_date, access_expiry_date = EXCLUDED.access_expiry_date;

  UPDATE public.plan_orders SET
    payment_status = 'paid',
    paid_at = (_order_update->>'paid_at')::timestamptz,
    access_start_date = (_order_update->>'access_start_date')::timestamptz,
    access_expiry_date = (_order_update->>'access_expiry_date')::timestamptz,
    provider_reference = COALESCE(_order_update->>'provider_reference', provider_reference),
    provider_transaction_id = COALESCE(_order_update->>'provider_transaction_id', provider_transaction_id),
    provider_status = COALESCE(_order_update->>'provider_status', provider_status),
    provider_verified_at = COALESCE((_order_update->>'provider_verified_at')::timestamptz, provider_verified_at),
    captured_amount = COALESCE((_order_update->>'captured_amount')::numeric, captured_amount),
    captured_currency = COALESCE(_order_update->>'captured_currency', captured_currency),
    captured_at = COALESCE((_order_update->>'captured_at')::timestamptz, captured_at),
    capture_status = COALESCE(_order_update->>'capture_status', capture_status),
    last_error = NULL
  WHERE id = _order_id;

  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE payment_reference = _subscription->>'payment_reference') THEN
    INSERT INTO public.subscriptions (user_id, tier, status, currency, amount, payment_reference, payment_provider, started_at, expires_at)
    VALUES ((_subscription->>'user_id')::uuid, (_subscription->>'tier')::smallint, 'active'::public.subscription_status,
      _subscription->>'currency', (_subscription->>'amount')::numeric, _subscription->>'payment_reference',
      _subscription->>'payment_provider', (_subscription->>'started_at')::timestamptz, (_subscription->>'expires_at')::timestamptz);
  END IF;
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.apply_paid_order_atomic(uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paid_order_atomic(uuid, text, jsonb, jsonb, jsonb) TO service_role;