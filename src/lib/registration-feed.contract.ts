/**
 * Rights Registration Hub — inbound feed contract, version 1.0.
 *
 * Shared, dependency-light (zod only) so Catalog and Split Sheets can copy this
 * file verbatim and validate their outgoing events before sending.
 * The OneSuite endpoint validates with exactly these schemas.
 */
import { z } from "zod";

export const FEED_SCHEMA_VERSION = "1.0" as const;
export const FEED_ENDPOINT_PATH = "/api/public/registration/source" as const;

export const FEED_EVENT_TYPES = {
  catalog: "catalog.work.snapshot",
  splits: "splits.composition.snapshot",
} as const;

const id = z.string().trim().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true });

/**
 * Catalog payload rule: every field Catalog stores is a REQUIRED key whose value
 * may be null. `null` means "Catalog supports this field but it is empty"
 * (missing). A key that is not in this contract is something Catalog cannot
 * supply (unsupported) — see CATALOG_UNSUPPORTED_FIELDS.
 * Catalog never sends ownership, performing, mechanical or sync rights.
 */
const t = (max: number) => z.string().max(max).nullable();
const n = z.number().int().min(0).nullable();
const d = isoDate.nullable();

export const CatalogReleaseSchema = z
  .object({
    release_id: id,
    title: t(500),
    upc: t(20),
    catalog_number: t(100),
    release_date: d,
    release_type: t(50),
    label: t(300),
    distributor: t(300),
    territory: t(200),
    genre: t(100),
    pline: t(300),
    cline: t(300),
    // Where this recording sits on this release (release_recordings).
    track_number: n,
    disc_number: n,
  })
  .strict();

export const CatalogRecordingSchema = z
  .object({
    recording_id: id,
    recording_uid: id.nullable(),
    title: t(500),
    artist: t(500),
    isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, "ISRC must be 12 characters, no dashes").nullable(),
    version: t(200),
    duration_seconds: n,
    recording_date: d,
    release_date: d,
    label: t(300),
    studio: t(300),
    genre: t(100),
    language: t(20),
    explicit: z.boolean(),
    pline: t(300),
    releases: z.array(CatalogReleaseSchema).max(500),
  })
  .strict();

export const CatalogWorkPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    alternate_titles: z.array(z.object({ title: z.string().min(1).max(500) }).strict()).max(100),
    iswc: z.string().regex(/^T-?\d{3}\.?\d{3}\.?\d{3}-?\d$/, "ISWC format T-123.456.789-0").nullable(),
    language: t(20),
    genre: t(100),
    duration_seconds: n,
    creation_date: d,
    copyright_date: d,
    copyright_owner: t(300),
    work_type: t(50),
    version_type: t(50),
    territory: t(200),
    work_code: t(100),
    publisher_reference: t(200),
    recordings: z.array(CatalogRecordingSchema).max(500),
  })
  .strict();

/** Registration-relevant Catalog fields, for readiness (present / missing / unsupported). */
export const CATALOG_WORK_FIELDS = [
  "title", "alternate_titles", "iswc", "language", "genre", "duration_seconds", "creation_date",
  "copyright_date", "copyright_owner", "work_type", "version_type", "territory", "work_code", "publisher_reference",
] as const;
export const CATALOG_RECORDING_FIELDS = [
  "title", "artist", "isrc", "version", "duration_seconds", "recording_date", "release_date", "label", "studio", "genre", "language", "pline",
] as const;
export const CATALOG_RELEASE_FIELDS = [
  "title", "upc", "catalog_number", "release_date", "release_type", "label", "distributor", "territory", "genre", "pline", "cline", "track_number", "disc_number",
] as const;

/** Registration fields the current Catalog schema has no column for. */
export const CATALOG_UNSUPPORTED_FIELDS = [
  { path: "work.alternate_titles[].type", note: "Catalog stores alternate titles as one semicolon-separated text, with no title type." },
  { path: "recordings[].primary", note: "Catalog has no primary-recording flag on work_recordings." },
  { path: "recordings[].recording_country", note: "Catalog does not store where a recording was made." },
  { path: "releases[].release_country", note: "Catalog stores a territory text, not a first-release country." },
  { path: "work.text_music_relationship", note: "Catalog does not record music/lyrics/both for a work." },
] as const;

export const SplitsWriterSchema = z
  .object({
    id,
    legalName: z.string().trim().min(1).max(300),
    role: z.string().max(100).nullable().optional(),
    ipiNumber: z.string().regex(/^\d{9,11}$/, "IPI name number is 9–11 digits").nullable().optional(),
    cmo: z.string().max(100).nullable().optional(),
    publisher: z.string().max(300).nullable().optional(),
    publisherIpi: z.string().regex(/^\d{9,11}$/).nullable().optional(),
    sharePercent: z.number().min(0).max(100),
  })
  .strict();

export const SplitsCompositionPayloadSchema = z
  .object({
    sheet_type: z.literal("composition"),
    ownership_validated_at: isoDateTime.nullable(),
    // Every writer must be sent. OneSuite never truncates; neither may the sender.
    writers: z.array(SplitsWriterSchema).max(1000),
  })
  .strict();

const envelope = {
  schema_version: z.literal(FEED_SCHEMA_VERSION),
  event_id: id,
  occurred_at: isoDateTime,
  workspace_id: z.string().uuid(),
  work_uid: id,
  source_record_id: id,
  source_revision: id,
};

export const CatalogFeedEventSchema = z
  .object({
    ...envelope,
    event_type: z.literal(FEED_EVENT_TYPES.catalog),
    payload: CatalogWorkPayloadSchema,
  })
  .strict();

export const SplitsFeedEventSchema = z
  .object({
    ...envelope,
    event_type: z.literal(FEED_EVENT_TYPES.splits),
    ownership_revision: id,
    payload: SplitsCompositionPayloadSchema,
  })
  .strict();

export type CatalogFeedEvent = z.infer<typeof CatalogFeedEventSchema>;
export type SplitsFeedEvent = z.infer<typeof SplitsFeedEventSchema>;

export type FeedSourceApp = "catalog" | "splits";

export function schemaForApp(app: FeedSourceApp) {
  return app === "catalog" ? CatalogFeedEventSchema : SplitsFeedEventSchema;
}

/** Plain-language list of problems, safe to return to the calling server. */
export function feedIssues(error: z.ZodError) {
  return error.issues.slice(0, 50).map((i) => ({ path: i.path.join("."), message: i.message }));
}

/** Response codes the endpoint can return, and whether the sender should retry. */
export const FEED_RESPONSES = {
  created: { status: 201, retry: false },
  duplicate: { status: 200, retry: false },
  invalid_app_slug: { status: 400, retry: false },
  invalid_body: { status: 400, retry: false },
  unauthorized: { status: 401, retry: false },
  app_mismatch: { status: 401, retry: false },
  app_not_entitled: { status: 403, retry: false },
  workspace_not_found: { status: 404, retry: false },
  event_id_reused: { status: 409, retry: false },
  work_workspace_conflict: { status: 409, retry: false },
  source_record_conflict: { status: 409, retry: false },
  sso_key_not_configured: { status: 503, retry: true },
  server_error: { status: 500, retry: true },
} as const;
