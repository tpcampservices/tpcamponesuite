# Connecting a TP-CAMP app to OneSuite

OneSuite owns the account and the plan. Each app reads the plan and enforces its own limits.

## 1. Same backend

Each app must point at the **same** Lovable Cloud / Supabase project as OneSuite,
so `auth.users` and profiles are shared. Remove the app's own sign-up screen.

## 2. Shared secret

Each app needs the `TPCAMP_SSO_KEY` secret (server-side only).

## 3. Sign-in hand-off

OneSuite's dashboard opens `https://<app>.tpcamponesuite.app/sso?ticket=…`.

The app's `/sso` route calls its own server, which POSTs:

```
POST https://tpcamponesuite.app/api/public/sso/exchange
x-tpcamp-key: <TPCAMP_SSO_KEY>
{ "ticket": "<ticket>", "app_slug": "catalog" }
```

Response: `{ token_hash, email, entitlement }`.

In the browser the app then runs:

```ts
await supabase.auth.verifyOtp({ token_hash, type: "email" });
```

That creates a normal session for the same OneSuite user. Tickets are
single-use and expire after 2 minutes.

App slugs: `catalog`, `invoice`, `splits`, `operations`, `finance`.

## 4. Reading the entitlement

Any time the app needs the current plan (page load, before creating a record):

```
POST https://tpcamponesuite.app/api/public/sso/entitlement
x-tpcamp-key: <TPCAMP_SSO_KEY>
{ "user_id": "<supabase user id>" }
```

Response includes:

```
hasAccess, status (none|active|expired), planId, planName,
billingPeriod, startDate, expiryDate, seats, isSuperAdmin,
limits: [{ metric, label, limit }]
```

Rules for the app:

- `hasAccess === false` → show a read-only / "renew in OneSuite" state; never block data.
- Never trust a plan value sent from the browser — always call this endpoint server-side.
- Count the app's own records and compare against the matching `limit`
  (`catalogRecords`, `activeProjects`, `invoicesPerMonth`,
  `financeTransactionsPerMonth`, `contractsPerMonth`, `splitSheetsPerMonth`, `seats`).
- Monthly metrics reset on the first of each calendar month (UTC).
