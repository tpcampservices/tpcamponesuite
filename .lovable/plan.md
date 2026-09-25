# Phase 1 — PayWise sandbox infrastructure + hide PayPal

## Pre-change audit (current state)

1. **PayPal checkout:** `/pricing` renders `PaypalPayButton` (`src/components/paypal-pay-button.tsx`). It is the only place a customer can start a payment. Renewal and add-ons use the same pricing screen. The dashboard only links to the admin "PayPal settings". `/payment-success` is the PayPal confirmation page.
2. **Payment tables:** `plan_orders` (one row per checkout: user, organization, plan, term, amounts, add-ons, `payment_provider`, `payment_status`, `paypal_order_id`, `paypal_capture_id`, capture fields, `paid_at`, access dates, `last_error`). There are also `paypal_webhook_events` (verified PayPal event log with a duplicate flag), the legacy `subscriptions` and `integration_settings` (server-only credentials).
3. **Activation:** `applyPaidOrder()` in `access.server.ts`, called only from `finalizeOrder()` after PayPal capture and an amount check. It is idempotent on `payment_status = 'paid'`.
4. **Renewal / early renewal:** inside `applyPaidOrder()`. Unused days carry forward from the current expiry.
5. **Entitlements:** `applyPaidOrder()` writes the entitlement row, and `refreshEntitlementStatus()` expires it. SSO reads from these.
6. **Payment history:** `getAccessState()` → `plan_orders` for the user, shown on the dashboard. It shows `provider` and `reference` (currently `paypal_order_id`).
7. **Reusable abstraction:** `plan_orders.payment_provider` already exists. There's no provider interface beyond that. PayWise will reuse `plan_orders` and not create a second billing system.
8. **Files:** listed below.
9. **Conflicts found (need your awareness, not blocking sandbox):**
   - **PW-ip-address:** PayWise docs describe it as a *fixed institution IP* that is allow-listed. OneSuite's server has no fixed outbound IP. I'll read it from a server setting `PAYWISE_IP_ADDRESS` (no hard-coded value). If it's missing, outbound PayWise calls refuse with a clear message. Production may need a fixed-IP relay; please confirm this with PayWise.
   - **No documented signature on notify/callback:** the inbound payloads can't be authenticated. That's fine for Phase 1 because they only log. Phase 2 activation must re-verify each payment via `GET /payments/status` and must not trust the payload.
   - **Route paths:** `/api/payments/paywise/*` sits outside the `/api/public/*` prefix that normally bypasses site auth. The published site is public, so these URLs should still work. I'll create them exactly as you configured them and confirm with an unauthenticated probe.

## Database change (one tracked migration)

```sql
-- Provider-neutral PayWise reference columns on the existing order table
ALTER TABLE public.plan_orders
  ADD COLUMN provider_reference text,          -- OneSuite reference sent to PayWise
  ADD COLUMN provider_transaction_id text,     -- PayWise transaction/request id
  ADD COLUMN provider_status text,             -- raw PayWise status
  ADD COLUMN provider_verified_at timestamptz; -- set only by server status check (Phase 2)
CREATE UNIQUE INDEX plan_orders_provider_reference_uq
  ON public.plan_orders (payment_provider, provider_reference) WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX plan_orders_provider_txn_uq
  ON public.plan_orders (payment_provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

-- Inbound PayWise event log (diagnostics + idempotency foundation)
CREATE TABLE public.paywise_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('notify','callback')),
  environment text NOT NULL DEFAULT 'sandbox',
  event_type text,
  dedupe_key text NOT NULL,            -- event id / transaction id + status, else sha256 of body
  paywise_reference text,
  onesuite_reference text,
  plan_order_id uuid REFERENCES public.plan_orders(id) ON DELETE SET NULL,
  processing_status text NOT NULL DEFAULT 'logged',  -- logged | unmatched | error
  verification_status text NOT NULL DEFAULT 'not_verified',
  duplicate_count integer NOT NULL DEFAULT 0,
  last_duplicate_at timestamptz,
  error_message text,
  payload jsonb,                       -- redacted: api_key / keys / tokens / card fields removed
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, dedupe_key)
);
GRANT ALL ON public.paywise_events TO service_role;   -- no anon/authenticated grants
ALTER TABLE public.paywise_events ENABLE ROW LEVEL SECURITY;
-- No policies: browser roles cannot read or write. Super Admin reads via a server action
-- that checks has_role(...,'admin') first.
```

Existing PayPal columns, rows, `paypal_webhook_events` and settings stay untouched.

## Hide PayPal

- `/pricing`: replace `PaypalPayButton` with a "PayWise checkout — coming soon (sandbox testing)" notice. No customer can start a PayPal payment. The component, server actions, webhook, secrets and admin screens stay in place.
- Update the customer-facing copy that promises PayPal (pricing text, home "USD (PayPal)", the tiers comparison line) to neutral wording. Legal pages stay unchanged unless you ask.
- A central flag `CUSTOMER_PAYMENT_PROVIDER = "paywise"` in `src/lib/payment-provider.ts`, and `createOrder` refuses PayPal server-side when the flag isn't PayPal. That way a direct call can't start PayPal either.
- Payment history keeps showing PayPal rows with their provider and reference.

## PayWise pieces

- **Secrets (names only):** `PAYWISE_SUBSCRIPTION_KEY` (header), `PAYWISE_BUSINESS_API_KEY` (body `api_key`), `PAYWISE_ENVIRONMENT=sandbox` (I'll set this one), `PAYWISE_IP_ADDRESS` (fixed institution IP from PayWise). I'll open the secure form for the first two and the IP.
- **`src/lib/paywise.server.ts`:** sandbox-only client. It refuses anything except `sandbox` in Phase 1. Base `https://sandbox-api.paywise.co`, `?version=2024-10-01`. Headers: `content-type`, `PW-subscription-key`, `PW-ip-address`, `PW-origin-country: TT`, `PW-request-date` (UTC `YYYY-MM-DD HH:mm:ss`, server-generated), `User-Agent: TP-CAMP-OneSuite/1.0`. Functions: `createPaymentRequest()` (POST /payments/request, `api_key` in body) and `getPaymentStatus()` (GET /payments/status). Nothing calls them from customer flows yet. Errors are redacted.
- **`src/lib/paywise-events.server.ts`:** size-capped (256 KB) safe parse of JSON or form bodies, redaction, dedupe key, insert-or-increment-duplicate, and order matching by `provider_reference` / `provider_transaction_id` (never by amount or title). It never touches entitlements or `applyPaidOrder`.
- **Routes:** `POST /api/payments/paywise/notify` and `POST /api/payments/paywise/callback`. Both return `200 {"received":true}` for logged and duplicate events, 400 for unreadable bodies, and 413 when too large. Neither activates anything.
- **Pages:** `/payment/paywise/success` ("Payment received. We're confirming your PayWise transaction." with no activation claim and no server call that changes state) and `/payment/paywise/error` (links back to Pricing and the Dashboard).
- **Super Admin diagnostics:** `/admin/paywise` lists event type, PayWise reference, matched OneSuite order, received time, processing, verification, duplicate count and error. It is admin-checked on the server. Payloads are shown redacted, and a secret-presence panel shows yes/no only.

## Files

New: `src/lib/payment-provider.ts`, `src/lib/paywise.server.ts`, `src/lib/paywise-events.server.ts`, `src/lib/paywise.functions.ts`, `src/lib/paywise.test.ts`, `src/routes/api/payments/paywise/notify.ts`, `src/routes/api/payments/paywise/callback.ts`, `src/routes/payment.paywise.success.tsx`, `src/routes/payment.paywise.error.tsx`, `src/routes/_authenticated/admin/paywise.tsx`, migration.
Edited: `src/routes/pricing.tsx`, `src/lib/billing.functions.ts` (server-side PayPal refusal only), `src/routes/index.tsx`, `src/lib/tiers.ts` (copy), and the dashboard admin link.
Not touched: `access.server.ts` activation/renewal/entitlements, plans/pricing, SSO, the registration hub, and PayPal webhook/settings.

## Tests

- Headers: exact names, `TT`, date format, the subscription key only in the header and `api_key` only in the body, and non-sandbox refused.
- Redaction: `api_key`, keys and tokens never stored or returned.
- Notify/callback: a valid event is logged. The same event twice gives one row and duplicate_count = 1, with 200 both times. Malformed bodies get 400, oversize bodies get 413, and an unknown reference is logged as unmatched.
- No side effects: after events, `plan_orders.payment_status`, entitlements and `applyPaidOrder` are never called (mocked spy).
- The success page makes no state-changing server call.
- `createOrder` refuses PayPal while PayWise is the active provider.
- The admin diagnostics action refuses non-admins.
- Then all tests, type check, production build and an unauthenticated probe of both endpoints on the preview. No payment is made and nothing is published.
