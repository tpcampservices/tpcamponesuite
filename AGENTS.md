<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- PayWise: inbound notify/callback only log to paywise_events (unique channel+dedupe_key); activation must re-verify via GET /payments/status server-side — payloads are unsigned.
- Registration Identity (public.registration_identities, one row per workspace) is written only via server functions after an Owner/Administrator role check on the server-resolved workspace; not a splits.* permission, because it is OneSuite admin data.
- Paid-order activation: every provider (PayPal, WAM, PayWise) goes through applyPaidOrder() with a VerifiedPayment planned by src/lib/paid-order.core.ts; the order's payment_provider must match the payment's provider, so one provider's metadata is never recorded as another's.

- WAM checkout: USD stays the authoritative price; TTD amount/rate are locked on plan_orders at creation from integration_settings WAM_USD_TTD_RATE (no code fallback; missing rate fails closed). Why: an existing order must never be re-priced.
- WAM webhook uses synchronous reconciliation (verify signature, re-fetch status via SDK, exact match, atomic claim, applyPaidOrder) before any 2xx. Why: no durable background worker exists.
- WAM/PayWise activation is a single atomic DB call (apply_paid_order_atomic); an "activating" claim older than WAM_STALE_CLAIM_MS may be reclaimed, and Super Admin recovery re-verifies with WAM through the same reconcile path. Why: an interrupted run must never leave access half-granted or stuck.
- WAM card checkout is refused unless WAM is in staging and the caller is a Super Admin; the WAM intent idempotency key is the order id. Why: no customer charge before approval, and retries can never create a second chargeable payment.
