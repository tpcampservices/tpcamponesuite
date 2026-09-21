# Audit — Super Admin subscriber management + HubSpot CRM sync

Inspection only. Nothing was changed.

## What already exists

**1. Signup / auth / profile creation**
Email+password and Google sign-in on the public `/auth` page, plus confirmation (`/auth/callback`) and invite (`/auth/invite`) routes. A database trigger on new user creation writes the profile row, assigns a role (`super_admin` for the very first account, otherwise `member`), and provisions a workspace with an Owner membership and full app access. Signup never fails if workspace provisioning errors — it is retried/repairable later.

**2. Customer fields today**
- `profiles`: email, full name, organisation, country, timestamps.
- `business_profiles`: legal name, trading name, registration number, address, contact email, contact phone, signatory name/title, default currency, governing law.
- Auth records additionally hold email-confirmed state, last sign-in, created/invited dates and sign-in provider (read through the admin listing).
- `contact_messages`: name, email, subject, message from the public contact form.

**3. Super admin enforcement**
Every admin server action re-checks `super_admin` through the caller's own session before any privileged client loads. Admin screens: `/admin/users`, `/admin/settings` (PayPal credentials, plan mapping), `/admin/webhooks`. Admin routes sit under the authenticated subtree.

**4. Subscription / access tables**
- `access_entitlements` — the single access authority: plan, billing period, currency, add-ons, extra seats, seats limit, allowed apps, status + access_status, source, payment status, start/expiry dates, workspace link, admin notes, granted_by/at.
- `plan_orders` — PayPal order lifecycle: amounts, add-ons, order/capture ids, payment + capture status, captured amount/currency, paid_at, access window, last error.
- `subscriptions` — legacy/payment-history only, kept in step for older gating.
- `plan_limit_usage` — per-metric usage counters.

**5. Manual admin controls (already built)**
Admin Users screen supports search, per-account diagnostics (inspect), non-destructive repair, email invite, audit history, and a manual grant/override that sets plan, status, source, payment status, billing term, start date, expiry (or no expiry), seats limit and allowed apps. Guardrails: plan validated against the catalogue, no self-elevation, manual grants cannot claim to be PayPal payments.

**6. Workspace / team model**
Workspaces, memberships, six system roles, a 48-entry permission catalogue, role→permission mappings, per-member app access levels, member-level Allow/Deny advanced overrides, seat accounting, hashed invitations. Central Authorization v2 resolves entitlement ∩ membership ∩ app access ∩ role permissions ∩ overrides.

**7. Audit logs**
`admin_access_audit` (append-only: actor, target, action, before/after plan, status, source, payment status, expiry, reason, details) and `team_audit_log` (workspace membership, role, app-access and permission-override changes).

**8. Payments infrastructure**
PayPal Orders API (create/capture/reconcile/cancel), signature-verified PayPal webhook route, `paypal_webhook_events`, `paypal_webhook_diagnostics`, `paypal_plans`, plus a generic signed payments webhook. Credentials live in `integration_settings` (masked in UI) with sandbox/live switching.

**9–11. CRM / HubSpot status: nothing exists**
There is no HubSpot code, table, column, connector, secret, sync job, queue or status field anywhere in the project. The only HubSpot presence is the website chat widget script. Of the target feature set, the following already exist in usable form: a Super Admin account directory, a per-account detail/diagnostics view, editable subscription/account status (plan, status, expiry, seats, allowed apps, payment status), and a full audit trail. Nothing exists for: CRM sync status, automatic contact creation/update on signup, retry queue, backfill, or notification workflow.

## Gaps to build (no duplicate systems)

1. A private HubSpot access token secret (user-supplied) — none configured today.
2. One CRM mapping table (e.g. `crm_contacts`): user id, workspace id, HubSpot contact id, last synced hash, sync state, attempt count, last error, timestamps. Keeps CRM state out of `profiles`/`access_entitlements`.
3. A server-only HubSpot client: contact upsert by email, rate-limit and error handling, no secret ever reaching the browser.
4. A single sync entry point that builds the contact payload from existing sources (profile, business profile, entitlement, workspace, seats) so payload logic is never duplicated.
5. Sync triggers: after signup/profile completion, after a manual grant, and after a verified PayPal capture/webhook — all calling the same entry point, always after the TP-CAMP write commits.
6. Retry queue + scheduled drain via a signature-protected public API route, with bounded attempts and backoff.
7. Backfill action (super-admin only, batched, idempotent) for existing accounts.
8. CRM status surfaced on the existing Admin Users screen (synced / pending / failed + last error + manual resync), not a new screen.
9. Notification workflow: decide in HubSpot (workflows on synced properties) rather than rebuilding email logic here.

## Recommended build sequence

1. Secret + mapping table + masked connection test in Admin Settings (no writes to HubSpot yet).
2. Server-only client and payload builder, dry-run behind a super-admin action.
3. Enable sync on signup and on manual grant; record state in the mapping table.
4. Add entitlement/payment-driven sync on verified capture and webhook paths.
5. Retry queue + scheduled drain, then batched backfill.
6. Surface status and manual resync in the admin directory.
7. Configure HubSpot-side properties and notification workflows last.

## Security and data-model risks to address first

- **Token handling**: HubSpot token must be a server-side secret, read inside handlers only; never in `integration_settings` readable paths that could be echoed, never in client bundles.
- **PII outflow**: HubSpot receives personal and business contact data — send an explicit allow-list of fields, never payment identifiers, capture ids, tokens or internal ids beyond what is needed.
- **Sync must never block core flows**: signup, grant and capture paths must treat CRM failure as non-fatal and enqueue instead of throwing.
- **Idempotency**: match by email + stored contact id with a content hash, so retries and duplicate webhooks cannot create duplicate contacts or overwrite newer CRM edits blindly.
- **RLS**: the new mapping table should be service-role write, super-admin read only, with explicit grants; no anon access.
- **Source of truth**: HubSpot is write-mostly. No inbound HubSpot field may ever change plan, status, expiry, seats, allowed apps or roles in TP-CAMP.
- **Existing sharp edges worth noting**: first-ever account auto-becomes `super_admin`; `subscriptions` remains as payment history and must not be revived as an access authority; entitlements are keyed per user while access is workspace-scoped, so CRM records should carry the workspace id to avoid ambiguity later.
