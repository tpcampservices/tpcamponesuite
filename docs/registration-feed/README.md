# Rights Registration Hub — Source Feed Contract v1.0

Audience: engineers of **TP-CAMP Catalog** and **TP-CAMP Split Sheets**.
OneSuite only *receives* these events. It never edits Catalog or Split Sheets records through this feed.

Files in this package:

| File | Purpose |
| --- | --- |
| `registration-feed.contract.ts` | TypeScript + zod contract (identical to what OneSuite validates with) |
| `catalog.work.snapshot.v1.schema.json` | JSON Schema (2020-12) for the Catalog feed |
| `splits.composition.snapshot.v1.schema.json` | JSON Schema (2020-12) for the Split Sheets feed |
| `examples.ts` | Fictional example events |
| `registration-feed.contract.test.ts` | Reusable contract tests (vitest, ajv) |

## 1. Endpoint

```
POST https://tpcamponesuite.app/api/public/registration/source
Content-Type: application/json
```

Server-to-server only. Never call it from a browser.

## 2. Authentication and source identification

| Header | Value |
| --- | --- |
| `x-tpcamp-app` | `catalog` or `splits` — identifies the source application |
| `x-tpcamp-key` | The existing OneSuite shared server key already stored in your app's server-side secrets |

- The key is the same one your app already uses for OneSuite SSO / Authorization v2. No new key is issued.
- Read it inside your server handler from secret storage. Never put it in browser code, logs, screenshots, docs, tickets or Git.
- The value of `x-tpcamp-app` must match `event_type` (`catalog` → `catalog.work.snapshot`, `splits` → `splits.composition.snapshot`). OneSuite picks the schema from the header, so a Catalog event sent as `splits` is rejected.

## 3. Event types and version

| Source | `event_type` | `schema_version` |
| --- | --- | --- |
| Catalog | `catalog.work.snapshot` | `"1.0"` |
| Split Sheets | `splits.composition.snapshot` | `"1.0"` |

Each event is a **full snapshot** of the current state, not a diff. Send one after any change to a work (Catalog) or after a composition sheet's ownership is approved or revised (Split Sheets).

## 4. Envelope fields (both feeds)

| Field | Required | Meaning |
| --- | --- | --- |
| `schema_version` | yes | `"1.0"` |
| `event_type` | yes | See above |
| `event_id` | yes | Unique id of this event in your app (1–200 chars). Reuse it on retries. |
| `occurred_at` | yes | ISO 8601 with offset, when the change happened |
| `workspace_id` | yes | The **OneSuite** workspace UUID (your `onesuite_workspace_id`), not your local integration workspace id |
| `work_uid` | yes | Stable shared work id (Catalog `works.work_uid` = Splits `sheets.source_work_id`). Never a title. |
| `source_record_id` | yes | Your own primary key for the record (Catalog work id / Splits sheet id) |
| `source_revision` | yes | Your record revision (e.g. `works.source_revision`, `sheets.source_revision`) |
| `ownership_revision` | Splits only, yes | `sheets.ownership_revision` |
| `payload` | yes | Feed-specific, below |

Unknown fields are rejected everywhere, so mistakes surface instead of being silently dropped.

## 5. Payloads

**Catalog** `payload`: `title` (required); optional `iswc`, `language`, `duration_seconds`, `alternate_titles[] {title, type}`, `recordings[] {recording_id (req), recording_uid, isrc, title, artist, version, duration_seconds, release_date, primary, releases[] {release_id (req), upc, title, release_date, label}}`.
Contributors are **not** sent by Catalog — composition ownership comes only from Split Sheets.

**Split Sheets** `payload`: `sheet_type: "composition"`, `ownership_validated_at` (ISO or `null` if not yet approved — must be present), `writers[]` with `id` (your contributor id), `legalName`, `sharePercent` (0–100) required, and optional `role`, `ipiNumber` (9–11 digits), `cmo`, `publisher`, `publisherIpi`.
Send **every** writer. Do not send performing / mechanical / sync shares — the Hub records those separately and never derives them from `sharePercent`.

See `examples.ts` for full fictional events.

## 6. How OneSuite checks the workspace

In order, after the key check:
1. The body matches the schema for the app named in `x-tpcamp-app`.
2. `workspace_id` exists in OneSuite and is active → else `404 workspace_not_found`.
3. That workspace's plan includes your app → else `403 app_not_entitled`.
4. `work_uid` is not already registered to a different workspace → else `409 work_workspace_conflict`.
5. Within the workspace, the work is not already linked to a different record of your app → else `409 source_record_conflict` (e.g. a second sheet claiming the same work).

Conflicts are never overwritten automatically; they need a human decision.

## 7. Idempotency

- The snapshot fingerprint covers `payload`, `source_revision`, `ownership_revision` and `work_uid`.
- Same `event_id` + same content → `200` with `duplicate: true` (safe retry).
- Same `event_id` + different content → `409 event_id_reused`. Use a new `event_id` for every new change.
- New `event_id` but content identical to an existing snapshot → `200 duplicate: true`, nothing new stored.
- Stored snapshots are immutable.

## 8. Responses

| Status | Body | Retry? |
| --- | --- | --- |
| 201 | `{ ok: true, snapshot_id, duplicate: false }` | no |
| 200 | `{ ok: true, snapshot_id, duplicate: true }` | no |
| 400 | `{ error: "invalid_app_slug" }` | no — fix header |
| 400 | `{ error: "invalid_body", issues: [{ path, message }] }` | no — fix data |
| 401 | `{ error: "unauthorized" }` / `{ error: "app_mismatch" }` | no — fix configuration, alert |
| 403 | `{ error: "app_not_entitled" }` | no |
| 404 | `{ error: "workspace_not_found" }` | no |
| 409 | `event_id_reused` / `work_workspace_conflict` / `source_record_conflict` | no — needs review |
| 500 | `{ error: "server_error" }` | yes |
| 503 | `{ error: "sso_key_not_configured" }` | yes |

All responses carry `Cache-Control: no-store`.

## 9. Retry expectations

- Send from your outbox table; mark the row delivered only on 200/201.
- Retry only 500, 503 and network timeouts, with the **same `event_id` and body**: backoff 1 min, 5 min, 30 min, 2 h, 6 h, then stop and flag for review.
- Never retry 4xx automatically. Log the error code (never headers or the key) and surface it to an admin.
- Keep a timeout of about 15 seconds per request. Send events for one work in order.

## 10. Safe development test procedure

1. Use a development/preview deployment of your app and only fictional data (like `examples.ts`). Do not send real customer works.
2. Run the contract tests locally against events built by your own code: copy the package files, replace the examples with your builder's output, run `npx vitest run`.
3. Check the key and header without sending data: POST `{}` with `x-tpcamp-app` set. Expect `400 invalid_body` (key correct) or `401` (key wrong).
4. Ask the OneSuite admin to name a test workspace entitled to your app. Send one fictional event → expect `201`. Send it again → expect `200 duplicate: true`.
5. Change a field, send with a new `event_id` → `201`. Reuse the old `event_id` with the changed body → `409 event_id_reused`.
6. Confirm in OneSuite → Dashboard → Rights registrations that the test work appears with your source revision.
7. Ask the OneSuite admin to remove the test work afterwards. Production delivery starts only after written approval.
