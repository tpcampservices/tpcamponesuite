# TP-CAMP OneSuite → child application integration contract

OneSuite owns identity, workspace, plan and access. Each child app keeps its
**own** Lovable Cloud backend and its own data, and maps every record to the
canonical OneSuite user **and workspace**.

Do not repoint your app at OneSuite's backend. Do not share `auth.users`. Do not
build a second role/permission/plan/team system.

## 0. Canonical application slugs

| Slug (canonical, never rename) | Display label |
| --- | --- |
| `catalog` | Catalog |
| `splits` | Split Sheets |
| `finance` | Finance |
| `invoice` | Invoice |
| `operations` | **Workflow** |

`operations` is the persisted technical slug used by permissions, member access
rows, tickets and assertions. "Workflow" is only a label. Contracts is a module
**inside** OneSuite and is not a child app; it has no slug.

Access levels, exactly four: `no_access`, `view`, `edit`, `manage`.

## 1. Shared secret

Add `TPCAMP_SSO_KEY` to your project (same value OneSuite holds). Server-side
only — never in browser code, a URL, or a client bundle. If OneSuite issues your
app a dedicated key (`TPCAMP_SSO_KEY_<SLUG>`), use that instead; the calls are
identical. Always send `x-tpcamp-app: <your slug>` so your calls are bound to
your application.

## 2. Local shadow account and workspace column

```sql
ALTER TABLE public.profiles ADD COLUMN onesuite_user_id uuid;
CREATE UNIQUE INDEX profiles_onesuite_user_id_key
  ON public.profiles (onesuite_user_id);
```

Every business table also needs `onesuite_workspace_id uuid` and RLS scoped to
it. Workspace, not user, is the data boundary — teammates share the workspace's
records. Keep a per-user column only as creator metadata, never as an
authorization key. Never delete local data when access expires.

## 3. Sign-in hand-off

OneSuite opens `https://<app>.tpcamponesuite.app/sso?ticket=…`.

Your `/sso` route calls your **own server**, which POSTs:

```
POST https://tpcamponesuite.app/api/public/sso/exchange
x-tpcamp-key: <key>
x-tpcamp-app: catalog
{ "ticket": "<ticket>", "app_slug": "catalog" }
```

Response:

```json
{
  "canonical_user_id": "uuid",
  "email": "user@example.com",
  "name": "Full Name",
  "app_slug": "catalog",
  "workspace_id": "uuid",
  "app_access": "manage",
  "membership_status": "active",
  "role_key": "administrator",
  "role_name": "Administrator",
  "entitlement": { "...": "plan, limits, seats" },
  "issued_at": 1757000000,
  "expires_at": 1757000120,
  "jti": "…",
  "assertion": "<header>.<payload>.<signature>"
}
```

Tickets are single-use, bound to the app slug, and expire after 2 minutes.
OneSuite re-resolves authorization at redemption: a member with `no_access`,
a suspended/removed member, an expired plan or an app outside the plan gets an
error instead of an assertion.

## 4. Verify the assertion, then create a local session

`assertion` is a compact **JWT, HS256, signed with the shared key**.

Claims: `iss` (`tpcamp-onesuite`), `aud` and `app_slug` (your slug), `sub`
(canonical user id), `workspace_id` (canonical workspace), `app_access`
(`view`/`edit`/`manage` — never `no_access`), `membership_status`, `role_key`,
`is_owner`, `email`, `name`, `is_super_admin`, `has_access`, `plan_id`,
`status`, `jti`, `iat`, `exp` (120 s lifetime).

On your server:

1. Split on `.`, recompute HMAC-SHA256 over `header.payload`, compare in
   constant time.
2. Check `iss === "tpcamp-onesuite"`, `aud === "<your slug>"`, `exp > now`.
3. Store `jti` and reject any repeat — one assertion, one session.
4. Find or create the local account where `onesuite_user_id = sub`; update
   email/name.
5. Store `{ onesuite_user_id, workspace_id, app_access, role_key }` **in your
   own server-side session**, never in a client-readable cookie or JWT you would
   later trust back from the browser.
6. Redirect to your landing page.

Never show a child-app login screen, sign-up form, or password field.

## 5. Live authorization check (the source of truth after launch)

The launch token starts the session; it is **not** long-lived authority. Call
this on session start, on a short TTL (60–120 s), and unconditionally before any
`manage`-level or otherwise high-risk action:

```
POST https://tpcamponesuite.app/api/public/sso/authorization
x-tpcamp-key: <key>
x-tpcamp-app: catalog
{ "user_id": "<canonical_user_id>", "app_slug": "catalog",
  "workspace_id": "<cached workspace id, optional cross-check>" }
```

Response (200):

```json
{
  "authorized": true,
  "user_id": "uuid",
  "workspace_id": "uuid",
  "app_slug": "catalog",
  "app_access": "edit",
  "membership_status": "active",
  "role_key": "staff",
  "role_name": "Staff",
  "checked_at": "2026-09-14T21:00:00.000Z",
  "reason": null
}
```

When `authorized` is false, `app_access` is `no_access` and `reason` is one of
`invalid_app`, `no_workspace`, `membership_inactive`, `no_entitlement`,
`app_not_in_plan`, `no_access`, `workspace_mismatch`.

Errors: `400 invalid_body | invalid_app_slug | invalid_user_id`,
`401 unauthorized | app_mismatch`, `503 sso_key_not_configured`.

Because the answer is resolved live, all of these take effect on the next check:
member suspended or removed, app level changed, role changed, entitlement
expired, app removed from the plan, workspace disabled.

## 6. What your app must enforce

- `authorized === false` → end the session, show a "access removed / renew in
  OneSuite" state. Read-only fallback is acceptable only for
  `reason: "no_entitlement"`. Never delete or hide the user's data.
- `view` → reads only. `edit` → normal create/edit/workflow actions.
  `manage` → app administration, destructive and high-risk operations.
  Map levels to your own actions; OneSuite does not define your action list.
- Enforce the level **server-side on every mutation and privileged read**. Hiding
  a button is not enforcement — routes, RPCs, exports, imports and webhooks are
  all directly reachable.
- Never trust an access level, workspace id, user id or role that arrives from
  the browser. Use your server session, or re-check with the endpoint above.
- Cap session lifetime so revocation cannot be outlived by a stale session.

## 7. Entitlement and limits (unchanged)

```
POST https://tpcamponesuite.app/api/public/sso/entitlement
x-tpcamp-key: <key>
{ "user_id": "<canonical_user_id>" }
```

Returns `hasAccess, status, planId, planName, billingPeriod, startDate,
expiryDate, seats, isSuperAdmin, limits[{ metric, label, limit }]`. Always
server-side. Count your own records against the matching limit
(`catalogRecords`, `activeProjects`, `invoicesPerMonth`,
`financeTransactionsPerMonth`, `contractsPerMonth`, `splitSheetsPerMonth`,
`seats`). Monthly metrics reset on the first of each calendar month (UTC).

## 8. Unauthenticated visitors and logout

- No local session → redirect to `https://tpcamponesuite.app/auth`.
- Logout → clear the local session, then redirect to
  `https://tpcamponesuite.app/dashboard`.
