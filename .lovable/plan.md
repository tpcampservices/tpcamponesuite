# Rights Registration Hub — Stage 0 audit and proposed Stage 1

Stage 0 was analysis only. Nothing was changed in OneSuite, Catalog or Split Sheets.

## Blocking conflicts (decisions needed before Stage 1)

1. **Where the Hub lives.** The master specification (section 1) says "Place the Registration Hub in Splits". The project instructions describe adding it to "OneSuite Catalog and Splits". A standing rule on this project says child apps (Catalog, Split Sheets) are never modified from here. From this project I can only read those apps. I can't build inside them.
2. **Source revisions do not match.** The specification is pinned to Catalog `c547f70…` and Splits `a1a2299…` (17 Sep 2026). The current app snapshots I read are Catalog `58b22480` and Splits `3dcb3657`. These may be the same code under different commit IDs, or newer code. I can't confirm which.
3. **Live databases.** I could read each app's code, its migrations and its generated types. I can't query the Catalog or Split Sheets databases from this project, so actual row counts, how complete the data is, live security rules and storage buckets are unverified. None of the three backends has any rights-registration tables yet.

## Current-state architecture

```text
 OneSuite (this project)            Catalog Hub                      Split Sheet Creator
 identity, workspace, plan,  SSO    works / recordings / releases     sheets (composition|master, data jsonb)
 Authorization v2  ───────────────► work_contributors,                sheet_versions (snapshots)
 /api/public/sso/authorization      recording_contributors            contributors (data jsonb)
                                    work_recordings, release_recordings export_settings (CWR settings)
                                    ownership_projections/applications cwr.ts  (CWR 2.1 exporter)
                                    outbox ──── integration events ───► inbox
                                    inbox  ◄─── ownership events ───── outbox
 No rights tables                   No registration tables            No submission/ACK tables
```

## Existing records per app (from generated types and migrations)

**Catalog:** `works` (work_uid, iswc, title, alternate_titles, language, duration_seconds, work_type, version_type, copyright_owner, society_registration, publisher_reference, lyrics, lyrics_file_path, source_revision, splits_synced_at, onesuite_workspace_id); `work_contributors` (name, role, share, ipi_number, society, publisher_name, email); `recordings` (recording_uid, isrc, artist, title, version, duration_seconds, release_date, pline, source_revision); `recording_contributors`; `releases` (upc, catalog_number, release_date, label, territory); `work_recordings`; `release_recordings`; `ownership_projections` / `ownership_applications` (ownership_revision, validated, participants); inbox and outbox tables; functions `has_catalog_permission`, `apply_validated_ownership`, `current_onesuite_workspace`. There are 18 migrations. Pages: works, recordings, releases, catalogues, clients, contributors, search, unassigned.

**Split Sheets:** `sheets` (type, source_work_id, source_recording_id, source_catalog_id, source_revision, ownership_revision, ownership_fingerprint, ownership_validated_at, data jsonb); `sheet_versions`; `contributors` (data jsonb); `export_settings` (settings jsonb); `integration_workspaces`; `splits_activity_log`; inbox and outbox tables. There are 6 migrations. The generated types list no database functions. Pages: sheet list, sheet editor, contributors. There is a CWR export pop-up.

**Identifiers:** `works.work_uid` ↔ `sheets.source_work_id` is the shared join. Recording and release links use local Catalog IDs. Both apps have `onesuite_workspace_id` as well as a separate integration `workspace_id`. Contributor IDs are not global: there's no shared party registry.

## Field gap summary (URP)

| Area | Status | Source |
|---|---|---|
| Work title, ISWC, language, duration, work type, version type | Existing, usable | catalog `works.*` |
| Alternate titles | Wrong shape (not typed by title type) | `works.alternate_titles` |
| Work/recording links, primary recording flag | Links existing; primary flag missing | `work_recordings`; new |
| ISRC, UPC, release date, P-line, label | Existing, usable | `recordings.*`, `releases.*` |
| Writer name, role, IPI, society, publisher, publisher IPI/CMO | Existing in jsonb, needs checking | `sheets.data.writers[]` |
| Writer ownership share | Wrong shape: one `sharePercent` stored as a number, no separate performing/mechanical/sync shares | `Writer.sharePercent` |
| Performing, mechanical and sync ownership and collection shares, controlled flag | Missing | new Hub model |
| Publishing chains, administrators, sub-publishers, territories | Missing | new |
| Agreements, mandates, authority, signers, signatures | Missing | new |
| Party identity (legal name parts, IPI base/name, affiliations by right/territory/date) | Missing (Catalog sends `party_id: null`) | new crosswalk |
| Audio/lyrics assets with hash | Only a lyrics path exists; no hashes, no audio | `works.lyrics_file_path`; new |
| Ownership revision and validation time | Existing | `sheets.ownership_*`, `ownership_projections` |
| Profile fingerprint, staleness | Derived at runtime | Hub |
| Submissions, attempts, receipts, ACKs, destination status, conflicts | Missing | new |
| Society registration status | Wrong shape (a single free-text field) | `works.society_registration` |

The full field-by-field list (F01–F48 against exact columns) will be written up as a table in the Stage 1 report.

## Reusable pieces

- Authorization v2 and workspace resolution (OneSuite); `has_catalog_permission` (Catalog).
- The integration inbox/outbox pattern, and ownership validation in `ownership-core.ts`.
- `sheet_versions`, which already holds immutable snapshots.
- The CWR 2.1 exporter `cwr.ts` (HDR, GRH, NWR/REV, SPU, SPT, SWR, SWT, PWR, ALT, PER, GRT, TRL) and its society code table. It needs the fixes listed in specification section 12, and it's not certified.
- The OneSuite design system, and its audit log pattern.

## Risks

- **Data quality:** writer shares are single numbers and may already mix up ownership and collection. Contributors are matched by name. Alternate titles are untyped. Society codes are guessed from names by `societyCode()`. The recording event publishes only one linked work (`limit(1)`).
- **Migrations:** splitting `sharePercent` into separate right-by-right values must never happen automatically. A 50/50 split must never be assumed.
- **Security:** Splits `sheets.data` is jsonb, so its fields can't be protected individually by the database rules. There are two workspace keys (`onesuite_workspace_id` and integration `workspace_id`). Split Sheets defines no database functions for permission checks. There are no permission levels yet for preparing, approving and submitting registrations. The live security rules haven't been checked.
- Types and migrations look consistent in the snapshots. The live databases couldn't be compared.

## Questions that can't be answered from code

1. Which app hosts the Hub (Split Sheets, per the specification, or OneSuite), and am I allowed to modify that app?
2. Are snapshots `58b22480` and `3dcb3657` the reviewed revisions?
3. Which workspace and data may be read for testing? Can I get read access to the Catalog and Split Sheets databases?
4. Destination facts: the COTT form binary, the live COSCAP form, MusicMark transport (SFTP), the CWR sender ID, and each society's submitter account and mandate.
5. Should the new rights permissions (prepare/approve/submit/admin) be added to the OneSuite permission catalogue as `splits.registration.*` or as a new app slug?

## Proposed Stage 1 — shared framework (after approval)

Stage 1 builds no destination adapter.

1. **Permissions (OneSuite):** add registration permissions for prepare, approve, submit and administer, mapped to roles and capped by app-access level. Authorization v2 will pass them through automatically.
2. **Hub schema** (in the host app you choose), every table workspace-scoped:
   - `registration_parties` and `party_identifiers` (the party crosswalk);
   - `registration_interests` (performing, mechanical and sync ownership and collection, with territory and dates);
   - `registration_agreements` and `registration_authority`;
   - `registration_assets` (storage reference and SHA-256);
   - `registration_profiles` (immutable URP snapshot, revision, fingerprint, source revisions);
   - `registration_validations`, `registration_packages`, `registration_submissions` (attempts), `registration_receipts`, `registration_status_history` (append-only), `registration_conflicts`, `registration_writeback_requests`.
   - Every table gets explicit grants and workspace security rules. Only the server can write snapshots and history, and they can't be edited or deleted.
3. **Services:** a URP builder that reads Catalog and Splits through the existing integration calls; a validation engine with plain-language messages; and a separate state machine: validated → package generated → approved → delivered → gateway ACK → society result → write-back.
4. **User interface:** one Registration Hub screen listing works with their profile status, source revisions and validation results. There'll be no submit buttons yet.
5. **Acceptance tests:**
   - workspace isolation;
   - Catalog/Splits source taking priority;
   - no share inference;
   - capacity limits flagged rather than truncated;
   - immutable snapshots and history;
   - idempotent profile builds;
   - conflicts created instead of overwrites;
   - write-back guarded.
6. The Stage 1 report will include screenshots, the exact migration SQL and the security rules. No production data will be modified.
