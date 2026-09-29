# PayWise / PayPal — Current State Report (read-only, no changes made)

## CURRENT STATE
1. Routes (all live on tpcamponesuite.app)
   - `/payment/paywise/success` (`src/routes/payment.paywise.success.tsx`) — informational only, no server call, says access is not active yet.
   - `/payment/paywise/error` (`src/routes/payment.paywise.error.tsx`) — informational, links to pricing.
   - `POST /api/payments/paywise/notify` and `/callback` (`src/routes/api/payments/paywise/*.ts`) — call `handlePaywiseRequest` (`src/lib/paywise-events.server.ts`): 256 KB cap, parse JSON or form body, extract refs, match `plan_orders` (provider=paywise, by `provider_transaction_id` or `provider_reference`), insert into `paywise_events` with `verification_status='not_verified'`, dedupe on channel+dedupe_key (duplicate_count++). Returns `{received:true,duplicate}`. No signature check (PayWise payloads unsigned).
   - `/admin/paywise` — Super Admin diagnostics.
2. Database
   - `plan_orders`: provider-neutral fields exist — `payment_provider`, `provider_reference`, `provider_transaction_id`, `provider_status`, `provider_verified_at`, `captured_*`, `last_error`, plus PayPal-specific `paypal_order_id`, `paypal_capture_id`. Current rows: 1 paypal/created, 1 paypal/cancelled, 0 paywise.
   - `paywise_events`: service-role only (no client policies). 0 rows now.
3. Client `src/lib/paywise.server.ts` (sandbox only, base `https://sandbox-api.paywise.co`, version `2024-10-01`, origin TT): `createPaymentRequest` -> `POST /payments/request` (api_key in body), `getPaymentStatus` -> `GET /payments/status`. Headers: PW-subscription-key, PW-ip-address, PW-origin-country, PW-request-date. Neither function is called by any app flow today.
4. Expected secrets: `PAYWISE_ENVIRONMENT` (must equal `sandbox`), `PAYWISE_SUBSCRIPTION_KEY`, `PAYWISE_BUSINESS_API_KEY`, `PAYWISE_IP_ADDRESS`. No business ID variable exists in code.
5. Configured now: only `PAYWISE_ENVIRONMENT`. Subscription key, business API key, IP address are absent. No business ID stored anywhere (secrets or `integration_settings`).
6. Checkout: does not work for PayWise. `PAYWISE_CHECKOUT_ENABLED=false` (`src/lib/payment-provider.ts`); pricing shows "Secure checkout by PayWise is coming soon". `createOrder` (`src/lib/billing.functions.ts`) is PayPal-only and throws because PayPal checkout is disabled.
7. Notify/callback only log; they never activate, extend or verify (`paywise-events.core.ts`).
8. Activation: `applyPaidOrder` in `src/lib/access.server.ts:231`, called only by PayPal `finalizeOrder` (`billing.functions.ts:181`) and the PayPal webhook (`src/routes/api/public/paypal/webhook.ts:292`). PayWise is not connected.
9. PayPal: hidden and disabled for customers (`PAYPAL_CHECKOUT_ENABLED=false`); code, webhook route, admin settings and sandbox credentials in `integration_settings` preserved; history intact.
10. Admin screen `/admin/paywise`: lists last 200 events and secret present/missing flags. It has no "send test payment" action — that button is in PayWise's own Checkout Builder, not OneSuite.
12. No changes to payment code since PayWise Phase 1; later work (identity, registration, SSO workspace_name, RLS fix on `paypal_plans`) does not touch the payment flow.

## ALREADY BUILT
Sandbox API client with redaction, inbound logging with dedupe/order matching, result pages, diagnostics, provider-neutral order columns, PayPal hidden.

## STILL MISSING (item 11)
1. Secrets: subscription key, business API key, IP address (and a business ID variable if PayWise requires one — confirm from PayWise docs).
2. A PayWise `createOrder` server function: price from server, insert `plan_orders` (provider=paywise, provider_reference), call `createPaymentRequest`, return redirect URL.
3. A server-side verification step: call `getPaymentStatus`, check amount/currency/reference, then call `applyPaidOrder` idempotently (provider-neutral capture id).
4. Wire notify/callback to trigger that verification (never trust the payload).
5. Enable the checkout button behind `PAYWISE_CHECKOUT_ENABLED`, sandbox only.
6. Tests; decide currency (TTD for PayWise vs current USD pricing).

## SAFE NEXT STEP
Supply the three missing PayWise sandbox values in Project Settings -> Secrets and confirm whether PayWise requires a separate business ID. Then approve a small "Phase 2" build covering steps 2–5 in sandbox only. Nothing was changed in this inspection.
