# Rights Registration Hub — Source Feed Contract v1.0 (pre-production revision 3)

Revision 3 replaces revisions 1 and 2 of the Catalog feed before any real delivery. Catalog events built for revision 1 are now rejected (`invalid_body`) until the Catalog builder is updated.

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
| `x-tpcamp-app` | `catalog` or `splits`. Must agree with the credential. |
| `x-tpcamp-key` | Your app's own registration-feed credential (not the SSO key) |
| `Content-Type` | `application/json` (optional `charset=utf-8`), otherwise 415 |

Each source app has its own credential per environment. OneSuite holds them in server-side secret slots:

| Slot | App | Environment |
| --- | --- | --- |
| `REG_FEED_KEY_CATALOG_DEV` | catalog | development |
| `REG_FEED_KEY_CATALOG_PROD` | catalog | production |
| `REG_FEED_KEY_SPLITS_DEV` | splits | development |
| `REG_FEED_KEY_SPLITS_PROD` | splits | production |

- The shared SSO / Authorization v2 key is **not** accepted.
- The credential decides which app is calling. A Catalog credential claiming `splits` is refused, and a Split Sheets credential claiming `catalog` is refused too.
- Credential format: 43–128 characters from `A–Z a–z 0–9 - _`, with no whitespace and at least 256 bits of randomness (for example, 32 random bytes in base64url). A value in any other format is treated as inactive.
- If two slots hold the same value, the endpoint returns `503 feed_misconfigured`. Neither app is accepted.
- The following all return the same `401 {"error":"unauthorized"}`:
  - a wrong, missing or revoked credential
  - an unknown app
  - an app/credential mismatch
  - a production credential while production delivery is disabled
- Development credentials may target only the workspaces listed in `REG_FEED_TEST_WORKSPACES`, a comma-separated list of UUIDs. Production credentials may never target those workspaces. Any other target returns `403 workspace_not_permitted`. An invalid list entry returns 503.
- Production delivery stays off until `REG_FEED_PROD_ENABLED=true` is set. The `REG_FEED_REVOKED` setting takes a comma-separated list of slot names to revoke.
- Headers are checked before the body is read. The 5,000,000-byte limit is counted on the bytes actually received, and anything larger returns 413, rejected whole.
- Keep the credential in server-side secret storage. Never put it in browser code, logs, screenshots, docs, tickets or Git.
- `x-tpcamp-app` must match `event_type`: `catalog` goes with `catalog.work.snapshot`, and `splits` goes with `splits.composition.snapshot`.

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

### Catalog payload (pre-production revision 3) and reconciliation with the master specification

Rules:
- Every stored Catalog field is a **required key**. Send JSON `null` when it is empty. Empty strings are rejected for every field.
- Something Catalog cannot supply is **not** in the contract. The Hub reports it as *unsupported*, separately from *missing* (`null`) and *invalid* (stored but badly formatted).
- Identifiers are strings exactly as stored (leading zeros kept). The Hub checks ISWC (with check digit), ISRC and UPC and reports an invalid value without dropping it.
- Dates are real calendar dates `YYYY-MM-DD`. Durations are integer seconds. `explicit` is a boolean. Track and disc positions are integers ≥ 1.
- Releases are listed **once** in `payload.releases`; each recording lists `release_links[] {release_id, track_number, disc_number}`. The Hub rejects duplicate ids, links to unlisted releases, and releases not linked to any recording.
- Destination display formats (`M.SS`, `HH:MM:SS`, dashed ISWC) are produced by adapters, never stored as the universal value.
- Catalog never sends ownership shares, performing, mechanical or synchronization rights, mandates, signing authority or registration status.

| URP field (spec ID) | Catalog table.column | Contract path | Type | Status | Missing value | Destinations | Transformation / validation | Classification |
|---|---|---|---|---|---|---|---|---|
| F01 `source_refs.catalog_work_id` | `works.id` | `source_record_id` | string | required | — (never null) | all (H) | Kept alongside `work_uid`; never a title match | supported |
| F01 `source_refs.work_uid` | `works.work_uid` | `work_uid` | string | required | — (event not sent without it) | all (H) | Must match Splits `source_work_id`; bound to one workspace | supported |
| F02 `source_refs.catalog_revision` | `works.registration_revision` | `source_revision` | string | required | — | all (H) | Frozen with the snapshot; staleness check | supported |
| F03 `work.title` | `works.title` | `payload.title` | string | required | — (non-blank) | COTT, COSCAP (128), ECCO, EBR, CWR | Trimmed; blank rejected | supported |
| F04 `work.alternate_titles[].title` | `works.alternate_titles` (split on `;`) | `payload.alternate_titles[].title` | array of objects | required key | `[]` | COTT, COSCAP (1×128), ECCO, EBR, CWR ALT | One entry per title; never a joined string | supported |
| F04 `alternate_titles[].type` / `.language` | — | — | — | — | URP `null` | CWR ALT | — | missing in Catalog |
| F05 `work.iswc` | `works.iswc` | `payload.iswc` | string | required key | `null` | EBR (O), CWR (C) | Hub canonicalises to `T`+10 digits and checks check digit; invalid ≠ missing; never generated | supported |
| F06 `work.duration_seconds` | `works.duration_seconds` | `payload.duration_seconds` | integer seconds | required key | `null` | COTT, COSCAP (`M.SS`), ECCO, EBR (HHMMSS), CWR | Seconds kept; each adapter formats | supported |
| F07 `work.genre` | `works.genre` | `payload.genre` | string | required key | `null` | COTT, COSCAP, ECCO, CWR (mapped) | Raw text; destination code mapping is reviewed per adapter | supported |
| F07 `work.language` | `works.language` | `payload.language` | string | required key | `null` | CWR | Raw text | supported |
| F08 `work.creation_date` | `works.creation_date` | `payload.creation_date` | date YYYY-MM-DD | required key | `null` | COTT, ECCO forms | Real calendar date; distinct from copyright date | supported |
| F08 `work.copyright_date` | `works.copyright_date` | `payload.copyright_date` | date YYYY-MM-DD | required key | `null` | CWR (C) | Real calendar date | supported |
| F08 `work.copyright_owner` | `works.copyright_owner` | `payload.copyright_owner` | string | required key | `null` | information only | Never used as ownership; parties come from Splits | supported |
| F09 `work.work_type` | `works.work_type` | `payload.work_type` | string | required key | `null` | COTT, COSCAP, ECCO, EBR, CWR | Raw value; vocabulary reviewed per adapter | supported |
| F09 `work.version_type` | `works.version_type` | `payload.version_type` | string | required key | `null` | as above | Raw value | supported |
| F10 `work.internal_code` | `works.work_code` | `payload.work_code` | string | required key | `null` | CWR/EBR submitter work ID (via Hub crosswalk) | Never truncated | supported |
| F10 `work.publisher_reference` | `works.publisher_reference` | `payload.publisher_reference` | string | required key | `null` | CWR, EBR | As stored | supported |
| `work.catalog_territory` | `works.territory` | `payload.territory` | string | required key | `null` | none directly | Descriptive only — not a rights/agreement territory (F33) | supported |
| F11 `work.first_release_date` | (recording/release dates are evidence) | — | date | conditional | URP `null` until confirmed | COTT, COSCAP, ECCO | Confirmed in the Hub; never the earliest date | sourced elsewhere (Hub) |
| F12 `recordings[].recording_id` | `recordings.id` via `work_recordings` | `payload.recordings[].recording_id` | string | required | — | all | Every linked recording, unique | supported |
| F12 `recordings[].recording_uid` | `recordings.recording_uid` | `…recording_uid` | string | required key | `null` | crosswalk | — | supported |
| F12 `selected_recording_id` | — | — | string | conditional (>1 recording) | URP `null` | all | Chosen in the Hub; never title-matched | sourced elsewhere (Hub) |
| F13 `recordings[].artists[]` | `recordings.artist` | `…artist` | string (credit text) | required key | `null` | COTT, COSCAP (128), ECCO, EBR, CWR PER | URP holds `[{display_name, party_type:null}]` | derived; structure missing in Catalog |
| F14 `recordings[].isrc` | `recordings.isrc` | `…isrc` | string | required key | `null` | EBR (O), CWR REC | Hub canonicalises (12 chars, no dashes); invalid flagged, not dropped | supported |
| F14 `recordings[].title` / `version` | `recordings.title` / `version` | `…title` / `…version` | string | required key | `null` | COTT, CWR REC | — | supported |
| F14 `recordings[].duration_seconds` | `recordings.duration_seconds` | `…duration_seconds` | integer seconds | required key | `null` | CWR REC | — | supported |
| F15 `recordings[].label`, `recording_date`, `release_date`, `studio` | matching `recordings` columns | same names | string / date | required keys | `null` | COTT, COSCAP, ECCO, CWR | Studio/label are never publishers | supported |
| `recordings[].genre`, `language`, `pline` | matching columns | same names | string | required keys | `null` | CWR/EBR where applicable | — | supported |
| `recordings[].explicit` | `recordings.explicit` (NOT NULL) | `…explicit` | boolean | required | — (always true/false) | informational | Never a string | supported |
| F16 `releases[]` | `releases.*` | `payload.releases[]` | array, each release once | required key | `[]` | COTT, EBR (library CD), CWR REC | Unique ids; every release linked | supported |
| F16 `releases[].title`, `upc`, `catalog_number`, `release_date`, `release_type`, `label`, `distributor`, `territory`, `genre`, `pline`, `cline` | matching `releases` columns | same names | string / date | required keys | `null` | as above | UPC kept as string (leading zeros); Hub checks 12/13 digits | supported |
| F16 track / disc | `release_recordings.track_number` / `disc_number` | `recordings[].release_links[].track_number` / `disc_number` | integer ≥1 | required keys | `null` | EBR cut, CWR | Link must point to a listed release | supported |
| F36 jingle, F37 origin, F38 derivation, F39 components, F40 performances | — | — | — | conditional | — | see spec §5 | — | missing in Catalog |
| F17–F33 parties, roles, IPI, affiliations, shares, PR/MR/SR, control, publishers, agreements | — | not in Catalog feed | — | — | — | all | Rejected if sent by Catalog | sourced elsewhere (Splits / Hub) |
| F34–F35, F41–F48 declarations, assets, authority, signatures, accounts, submissions, notes | — | not in Catalog feed | — | — | — | all | — | sourced elsewhere (Hub) |

**Size handling:** up to 500 recordings, 1,000 releases, 500 release links per recording and 100 alternate titles. The Hub refuses bodies over 5,000,000 bytes with `413 payload_too_large`. Nothing is ever truncated: an event over any limit is rejected whole, and needs review. A work at every limit fits under the body limit (tested).

Deliberately excluded: `works.society_registration` and `works.status` (registration status belongs to the Hub), `lyrics`, `lyrics_file_path`, `notes`, artwork, `work_contributors`, `recording_contributors`.

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
| 413 | `{ error: "payload_too_large", limit_bytes }` | no — needs review; never split or truncate |
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
