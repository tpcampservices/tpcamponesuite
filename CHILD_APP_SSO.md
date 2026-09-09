# Connecting a TP-CAMP app to OneSuite (separate backends)

OneSuite owns the account, the plan and the payment. Each child app keeps its
**own** Lovable Cloud backend and its own data, and maps every record to the
canonical OneSuite user ID.

Do **not** repoint your app at OneSuite's backend. Do **not** share auth.users.

App slugs: `catalog`, `invoice`, `splits`, `operations`, `finance`.

## 1. Shared secret

Add the `TPCAMP_SSO_KEY` secret to your project. Server-side only — it must
never appear in browser code, a URL, or a client bundle. Use the same value
OneSuite holds.

## 2. Local shadow account

Keep your existing users/data table. Add:

```sql
ALTER TABLE public.profiles
  ADD COLUMN onesuite_user_id uuid;
CREATE UNIQUE INDEX profiles_onesuite_user_id_key
  ON public.profiles (onesuite_user_id);
```

One local account ↔ one canonical OneSuite user ID. For the existing owner
account, backfill `onesuite_user_id = 'd881e786-b79a-4896-b3f1-a3a364c3ac38'`
so all current Catalog data stays owned by the same person. Never delete local
data when access expires.

## 3. Sign-in hand-off

OneSuite opens `https://<app>.tpcamponesuite.app/sso?ticket=…`.

Your `/sso` route calls your **own server**, which POSTs:

```
POST https://tpcamponesuite.app/api/public/sso/exchange
x-tpcamp-key: <TPCAMP_SSO_KEY>
{ "ticket": "<ticket>", "app_slug": "catalog" }
```

Response:

```json
{
  "canonical_user_id": "uuid",
  "email": "user@example.com",
  "name": "Full Name",
  "app_slug": "catalog",
  "entitlement": { "...": "see section 5" },
  "issued_at": 1757000000,
  "expires_at": 1757000120,
  "jti": "…",
  "assertion": "<header>.<payload>.<signature>"
}
```

Tickets are single-use, bound to the app slug, and expire after 2 minutes.

## 4. Verify the assertion, then create a local session

`assertion` is a compact **JWT, HS256, signed with `TPCAMP_SSO_KEY`**.

Payload claims: `iss` (`tpcamp-onesuite`), `aud` and `app_slug` (your slug),
`sub` (canonical user ID), `email`, `name`, `is_super_admin`, `has_access`,
`plan_id`, `status`, `jti`, `iat`, `exp` (120s lifetime).

On your server:

1. Split on `.`, recompute the HMAC-SHA256 over `header.payload` with
   `TPCAMP_SSO_KEY`, compare in constant time.
2. Check `iss === "tpcamp-onesuite"`, `aud === "<your slug>"`, `exp > now`.
3. Store the `jti` and reject any repeat — one assertion, one session.
4. Find or create the local account where `onesuite_user_id = sub`; update its
   email/name from the assertion.
5. Create your **own** local session for that account (your backend's admin
   client generating a session/magic-link for the shadow user is fine — it is
   your backend, not OneSuite's).
6. Redirect to your app's landing page (Catalog → Works).

Never show a child-app login screen, sign-up form, or password field.

## 5. Reading the entitlement

Any time the app needs the current plan (page load, before creating a record):

```
POST https://tpcamponesuite.app/api/public/sso/entitlement
x-tpcamp-key: <TPCAMP_SSO_KEY>
{ "user_id": "<canonical_user_id>" }
```

Response includes:

```
hasAccess, status (none|active|expired), planId, planName,
billingPeriod, startDate, expiryDate, seats, isSuperAdmin,
limits: [{ metric, label, limit }]
```

Rules for the app:

- Always call this server-side. Never trust a plan, entitlement or user ID sent
  from the browser.
- `hasAccess === false` → read-only / "renew in OneSuite" state. Never delete
  or hide the user's data.
- Count your own records and compare against the matching `limit`
  (`catalogRecords`, `activeProjects`, `invoicesPerMonth`,
  `financeTransactionsPerMonth`, `contractsPerMonth`, `splitSheetsPerMonth`,
  `seats`). Monthly metrics reset on the first of each calendar month (UTC).

## 6. Unauthenticated visitors and logout

- Direct visitor with no local session → redirect to
  `https://tpcamponesuite.app/auth`, not to a local login.
- Logout → clear the local session, then redirect to
  `https://tpcamponesuite.app/dashboard`.
