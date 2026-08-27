# TP-CAMP OneSuite — central authentication & entitlement

OneSuite (`https://tpcamponesuite.app`) is the single account + subscription authority.
The five child apps never decide access themselves — they ask OneSuite.

## 1. Endpoints exposed by OneSuite

### A. Ticket exchange (primary sign-in path)

```
POST https://tpcamponesuite.app/api/public/sso/exchange
Content-Type: application/json
x-tpcamp-key: <TPCAMP_SSO_KEY>        # only if the secret is configured
{ "ticket": "<one-time ticket>", "app": "finance" }
```

Response (200):

```json
{
  "authenticated": true,
  "user_id": "uuid",
  "email": "artist@example.com",
  "subscription_active": true,
  "subscription_status": "active",
  "expires_at": "2027-08-26T00:00:00Z",
  "super_admin": false,
  "entitled_apps": ["catalog","invoice","splits","operations","finance"],
  "app_slug": "finance"
}
```

Any failure returns the same shape with `authenticated: false`, `entitled_apps: []` and status 401/500.
Tickets are single-use, expire after 2 minutes, are stored only as SHA-256 hashes, and are bound to one app slug.
**Must be called from the child app's server** (server function / route handler), never the browser.

### B2. Server-to-server re-verification (preferred, no customer token)

```
POST https://tpcamponesuite.app/api/public/sso/verify
Content-Type: application/json
x-tpcamp-key: <TPCAMP_SSO_KEY_FINANCE or TPCAMP_SSO_KEY>
{ "user_id": "<onesuite_user_id>", "app": "finance" }
```

Returns the same entitlement shape plus `app_slug`. Requires a configured server credential
(returns 401 if none is configured). Unknown users return the denied shape with status 200 so
user IDs cannot be enumerated. Call at most every ~15 minutes or on session refresh.

### B. Bearer entitlement check (re-validation)

```
GET https://tpcamponesuite.app/api/public/entitlement
Authorization: Bearer <OneSuite Supabase access token>
```

Same response shape. Use this when a child app holds a OneSuite access token and wants to re-check on
each protected request/session refresh.

## 2. Handoff flow

1. Customer signs into OneSuite at `/auth`.
2. Dashboard app buttons point to `/sso/handoff?app=<slug>` (protected route).
3. OneSuite re-verifies entitlement server-side and mints a ticket, then redirects to
   `https://<app>.tpcamponesuite.app/sso/callback?ticket=...&app=<slug>`.
4. The child app's **server** exchanges the ticket (endpoint A), receives the identity + entitlement,
   and issues its own httpOnly session cookie (scoped to its own subdomain).
5. Every protected request in the child app re-checks its own session and, at least on session
   creation/refresh, the OneSuite entitlement. If either fails → deny.

App slugs: `catalog`, `invoice`, `splits`, `operations`, `finance`.

## 3. Redirects

- Not authenticated → `https://tpcamponesuite.app/auth?redirect=<encoded child URL>`
  OneSuite validates that URL against `*.tpcamponesuite.app` and ignores anything else (no open redirect).
- Authenticated but not subscribed → `https://tpcamponesuite.app/pricing`
- Cancelled/expired subscriptions return `subscription_active: false` → child app must redirect to pricing.
- `super_admin: true` always yields all five apps, regardless of subscription rows.

## 4. Environment variables

OneSuite (already present via Lovable Cloud): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, plus PayPal credentials.
Server credentials: `TPCAMP_SSO_KEY` (shared) and/or per-app overrides
`TPCAMP_SSO_KEY_CATALOG`, `TPCAMP_SSO_KEY_INVOICE`, `TPCAMP_SSO_KEY_SPLITS`,
`TPCAMP_SSO_KEY_OPERATIONS`, `TPCAMP_SSO_KEY_FINANCE`. The per-app key wins when present.
Server-only; never exposed to browsers.

Each child app needs (server-side only):

- `ONESUITE_BASE_URL=https://tpcamponesuite.app`
- `TPCAMP_SSO_KEY` (same value as OneSuite, if enabled)
- its own session-signing secret

No Supabase service-role key from OneSuite is ever shared with a child app.

## 5. CORS / allowed origins

OneSuite allows `tpcamponesuite.app`, `*.tpcamponesuite.app`, `*.lovable.app` (preview) and localhost,
with methods `GET, POST, OPTIONS` and headers `authorization, content-type, x-tpcamp-key`.
Server-to-server calls need no CORS at all — preferred.

## 6. Supabase auth settings

Add these redirect URLs in OneSuite auth settings:

- `https://tpcamponesuite.app`, `https://www.tpcamponesuite.app`, `https://tpcamponesuite.app/auth`
- `https://tpcamponesuite.app/auth/callback`, `https://tpcamponesuite.app/reset-password`

Child apps do **not** need Supabase auth of their own.

## 7. Prompt to run in each child project

> This app must not manage its own customer accounts or subscriptions. TP-CAMP OneSuite
> (`https://tpcamponesuite.app`) is the authentication and entitlement authority.
>
> 1. Add a server route `/sso/callback` that reads `ticket` and `app` from the query string and, **on the
>    server**, POSTs `{ ticket, app: "<this app's slug>" }` to
>    `https://tpcamponesuite.app/api/public/sso/exchange` with header `x-tpcamp-key: $TPCAMP_SSO_KEY`.
> 2. If the response has `authenticated: true`, `subscription_active: true` and this app's slug in
>    `entitled_apps`, create an httpOnly, Secure, SameSite=Lax session cookie for this subdomain holding
>    only `user_id`, `email`, `expires_at` and a short expiry, then redirect to the app home.
>    Otherwise deny.
> 3. Gate every page and every server route/function on that server-side session — never on localStorage,
>    cookies like `hasAccess=true`, URL params, React state or hidden buttons. Fail closed.
> 4. Re-verify with OneSuite (`GET /api/public/entitlement` with the OneSuite access token, or a fresh
>    ticket handoff) at least on session refresh, and at most every 15 minutes.
> 5. If there is no valid session, redirect to
>    `https://tpcamponesuite.app/auth?redirect=<encodeURIComponent(current absolute URL)>`.
>    If authenticated but `subscription_active` is false, redirect to `https://tpcamponesuite.app/pricing`.
> 6. Treat `super_admin: true` as full access.
> 7. Never store or read the OneSuite Supabase service-role key. Do not create signup/pricing flows here.
