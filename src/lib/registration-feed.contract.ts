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
const isoDateTime = z.string().datetime({ offset: true });

/**
 * Catalog payload rules (pre-production revision 3):
 * - Every field Catalog stores is a REQUIRED key. JSON `null` = supported but empty.
 *   Empty strings are rejected: never send "" for a missing value.
 * - A field that is not in this contract is unsupported by Catalog
 *   (CATALOG_UNSUPPORTED_FIELDS). "Unsupported" and "null" are never the same.
 * - Identifiers are strings exactly as stored; the Hub checks their format and
 *   reports an invalid value separately from a missing one.
 * - Dates are calendar dates YYYY-MM-DD. Durations are integer seconds.
 * - Releases are listed once at payload level; recordings point to them through
 *   release_links, which carry track/disc position (many-to-many preserved).
 * - Catalog never sends ownership, performing, mechanical or sync rights,
 *   mandates, signing authority or registration status.
 */
const text = (max: number) => z.string().max(max).regex(/\S/, "Send null instead of an empty value").nullable();
const ident = (max: number) => z.string().max(max).regex(/^\S(.*\S)?$/, "Identifier must not be empty or padded").nullable();
const seconds = z.number().int().min(0).max(360000).nullable();
const position = z.number().int().min(1).max(9999).nullable();
const date = z.string().date("Use a real calendar date, YYYY-MM-DD").nullable();

export const CATALOG_LIMITS = {
  recordings: 500,
  releases: 1000,
  release_links_per_recording: 500,
  alternate_titles: 100,
  /** Request body limit enforced by the Hub; larger bodies are refused, never cut. */
  body_bytes: 5_000_000,
} as const;

export const CatalogReleaseSchema = z
  .object({
    release_id: id,
    title: text(500),
    upc: ident(20),
    catalog_number: ident(100),
    release_date: date,
    release_type: text(50),
    label: text(300),
    distributor: text(300),
    territory: text(200),
    genre: text(100),
    pline: text(300),
    cline: text(300),
  })
  .strict();

export const CatalogReleaseLinkSchema = z
  .object({ release_id: id, track_number: position, disc_number: position })
  .strict();

export const CatalogRecordingSchema = z
  .object({
    recording_id: id,
    recording_uid: id.nullable(),
    title: text(500),
    artist: text(500),
    isrc: ident(20),
    version: text(200),
    duration_seconds: seconds,
    recording_date: date,
    release_date: date,
    label: text(300),
    studio: text(300),
    genre: text(100),
    language: text(20),
    explicit: z.boolean(),
    pline: text(300),
    release_links: z.array(CatalogReleaseLinkSchema).max(CATALOG_LIMITS.release_links_per_recording),
  })
  .strict();

export const CatalogWorkPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    alternate_titles: z
      .array(z.object({ title: z.string().max(500).regex(/\S/, "Alternate title must not be empty") }).strict())
      .max(CATALOG_LIMITS.alternate_titles),
    iswc: ident(20),
    language: text(20),
    genre: text(100),
    duration_seconds: seconds,
    creation_date: date,
    copyright_date: date,
    copyright_owner: text(300),
    work_type: text(50),
    version_type: text(50),
    territory: text(200),
    work_code: ident(100),
    publisher_reference: ident(200),
    recordings: z.array(CatalogRecordingSchema).max(CATALOG_LIMITS.recordings),
    releases: z.array(CatalogReleaseSchema).max(CATALOG_LIMITS.releases),
  })
  .strict();

/**
 * Relationship checks JSON Schema cannot express. The Hub runs these after the
 * schema check and rejects the event (400 invalid_body) rather than dropping rows.
 */
export function catalogRelationshipIssues(payload: z.infer<typeof CatalogWorkPayloadSchema>) {
  const issues: { path: string; message: string }[] = [];
  const recIds = new Set<string>();
  payload.recordings.forEach((r, i) => {
    if (recIds.has(r.recording_id)) issues.push({ path: `payload.recordings.${i}.recording_id`, message: "Recording listed twice." });
    recIds.add(r.recording_id);
  });
  const relIds = new Set<string>();
  payload.releases.forEach((r, i) => {
    if (relIds.has(r.release_id)) issues.push({ path: `payload.releases.${i}.release_id`, message: "Release listed twice." });
    relIds.add(r.release_id);
  });
  const linked = new Set<string>();
  payload.recordings.forEach((r, i) =>
    r.release_links.forEach((l, j) => {
      if (!relIds.has(l.release_id))
        issues.push({ path: `payload.recordings.${i}.release_links.${j}.release_id`, message: "Links to a release that is not in payload.releases." });
      linked.add(l.release_id);
    }),
  );
  payload.releases.forEach((r, i) => {
    if (!linked.has(r.release_id))
      issues.push({ path: `payload.releases.${i}.release_id`, message: "Release is not linked to any recording of this work." });
  });
  return issues.slice(0, 50);
}

/** Registration-relevant Catalog fields, for readiness (present / missing / invalid / unsupported). */
export const CATALOG_WORK_FIELDS = [
  "title", "alternate_titles", "iswc", "language", "genre", "duration_seconds", "creation_date",
  "copyright_date", "copyright_owner", "work_type", "version_type", "territory", "work_code", "publisher_reference",
] as const;
export const CATALOG_RECORDING_FIELDS = [
  "title", "artist", "isrc", "version", "duration_seconds", "recording_date", "release_date", "label", "studio", "genre", "language", "pline",
] as const;
export const CATALOG_RELEASE_FIELDS = [
  "title", "upc", "catalog_number", "release_date", "release_type", "label", "distributor", "territory", "genre", "pline", "cline",
] as const;
export const CATALOG_RELEASE_LINK_FIELDS = ["track_number", "disc_number"] as const;

/** Specification fields the current Catalog schema cannot supply (master spec §4). */
export const CATALOG_UNSUPPORTED_FIELDS = [
  { path: "work.alternate_titles[].type", spec: "F04", note: "Catalog stores alternate titles as one semicolon-separated text, with no title type." },
  { path: "work.alternate_titles[].language", spec: "F04", note: "Catalog has no language per alternate title." },
  { path: "recordings[].artists[] (structured person/group)", spec: "F13", note: "Catalog stores one artist credit text, not structured artists." },
  { path: "work.jingle", spec: "F36", note: "Catalog has no advertising/jingle fields." },
  { path: "work.origin", spec: "F37", note: "Catalog has no intended-purpose, production or library fields." },
  { path: "work.derivation", spec: "F38", note: "Catalog has no public-domain or arrangement details beyond version_type." },
  { path: "work.components[]", spec: "F39", note: "Catalog has no sample, medley or translation links." },
  { path: "work.performances[] / audiovisual_uses[]", spec: "F40", note: "Catalog has no performance or audiovisual-use records." },
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
  payload_too_large: { status: 413, retry: false },
  work_workspace_conflict: { status: 409, retry: false },
  source_record_conflict: { status: 409, retry: false },
  sso_key_not_configured: { status: 503, retry: true },
  server_error: { status: 500, retry: true },
} as const;
