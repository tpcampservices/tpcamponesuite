# Registration source endpoint: separate Catalog and Split Sheets credentials

## What changes
`POST /api/public/registration/source` stops using the shared SSO/integration key. Each source app gets its own development and production credential. The credential decides which app is calling, and `x-tpcamp-app` has to match it. The payload contract (revision 3), workspace checks, duplicates, conflicts and immutable snapshots all stay as they are. Production delivery stays disabled.

Other SSO endpoints (`exchange`, `authorization`, `entitlement`) are not touched.

## Credential slots (server-side secrets, names only, no values created)
| Slot | Source | Environment |
|---|---|---|
| `REG_FEED_KEY_CATALOG_DEV` | catalog | development |
| `REG_FEED_KEY_CATALOG_PROD` | catalog | production |
| `REG_FEED_KEY_SPLITS_DEV` | splits | development |
| `REG_FEED_KEY_SPLITS_PROD` | splits | production |

Supporting non-secret config (server env):
- `REG_FEED_TEST_WORKSPACES`: a comma-separated list of the workspace IDs designated for testing.
- `REG_FEED_PROD_ENABLED`: stays unset or `false`. While it is off, production credentials are refused with the generic 401.
- `REG_FEED_REVOKED`: an optional comma-separated list of revoked slot names. A revoked or empty slot never matches.

If a slot is unset, it is simply inactive. We never fall back to `TPCAMP_SSO_KEY`.

## Authentication flow
1. Read `x-tpcamp-key` and `x-tpcamp-app`.
2. Compare the key against all four active slots using a constant-time check: SHA-256 both sides, then `timingSafeEqual`. Every slot is always compared, so response timing doesn't reveal which slot matched.
3. Each of these returns the same generic `401 {"error":"unauthorized"}`:
   - no match
   - revoked slot
   - unknown app name
   - missing key
   - header app differs from the credential's app
   - a production credential while production is disabled
4. The authenticated app, not the header, decides the source used for ingestion.

## Environment policy (proposed)
- **Development credential:** the target workspace must be in `REG_FEED_TEST_WORKSPACES`. Otherwise it gets `403 {"error":"workspace_not_permitted"}`.
- **Production credential:** refused while production is disabled. Once enabled, it must not target a test workspace (`403 workspace_not_permitted`). Test data and real data stay separate.

## Body limit
The body is read as a stream, counting the actual bytes received. Reading stops, and the request is rejected whole with 413, the moment it passes 5,000,000 bytes. `Content-Length` is only used as an early reject; it is never trusted to allow a request. Exactly 5,000,000 bytes is accepted, and 5,000,001 is rejected. Nothing is ever truncated.

## Logging
Logs record only the app slug, the error code and the environment label. They never include keys, headers, hashes or slot values. A test captures `console.*` output and checks that none of the credential values appear in it.

## Files
- New: `src/lib/registration-auth.server.ts`, containing the pure function `authenticateFeed(headers, env)` and `readBodyLimited(request, limit)`.
- Edit: `src/routes/api/public/registration/source.ts`, which switches to the new authentication, the streamed body limit and the environment/workspace policy. The intake handler moves into an exported, testable function that accepts injected dependencies.
- New: `src/lib/registration-auth.test.ts`.
- Update: `docs/registration-feed/README.md`, covering the new auth section and slot names (no values).
- No database migration and no RLS changes.

## Acceptance tests (vitest, fake env values and in-memory store)
1. A valid Catalog key with `x-tpcamp-app: catalog` returns 201.
2. A valid Split Sheets key with `splits` returns 201.
3. A Catalog key claiming `splits` returns 401, and a Split Sheets key claiming `catalog` returns 401.
4. A wrong key, a missing key, an unknown app, a revoked slot and the shared SSO key all return the identical 401 body.
5. A development key targeting a non-test workspace returns 403.
6. A production key returns 401 while production is disabled. With the flag on in the test, a production key targeting a test workspace returns 403.
7. A body of exactly 5,000,000 bytes passes the size gate, and 5,000,001 bytes returns 413.
8. A duplicate event returns 200 with `duplicate: true`.
9. A reused event ID with different content returns 409 `event_id_reused`.
10. A work that belongs to a different workspace returns 409 `work_workspace_conflict`.
11. Captured logs contain no key values or the header value.
12. All 56 existing contract and parity tests still pass.

## Not in scope
- COTT
- Changes to Catalog or Split Sheets
- Creating, generating or displaying credentials
- Enabling delivery
- Publishing
