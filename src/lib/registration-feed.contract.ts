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

export const CatalogReleaseSchema = z
  .object({
    release_id: id,
    upc: z.string().max(20).nullable().optional(),
    title: z.string().max(500).nullable().optional(),
    release_date: isoDate.nullable().optional(),
    label: z.string().max(300).nullable().optional(),
  })
  .strict();

export const CatalogRecordingSchema = z
  .object({
    recording_id: id,
    recording_uid: id.nullable().optional(),
    isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, "ISRC must be 12 characters, no dashes").nullable().optional(),
    title: z.string().max(500).nullable().optional(),
    artist: z.string().max(500).nullable().optional(),
    version: z.string().max(200).nullable().optional(),
    duration_seconds: z.number().int().min(0).nullable().optional(),
    release_date: isoDate.nullable().optional(),
    primary: z.boolean().optional(),
    releases: z.array(CatalogReleaseSchema).max(500).optional(),
  })
  .strict();

export const CatalogWorkPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    iswc: z.string().regex(/^T-?\d{3}\.?\d{3}\.?\d{3}-?\d$/, "ISWC format T-123.456.789-0").nullable().optional(),
    language: z.string().max(20).nullable().optional(),
    duration_seconds: z.number().int().min(0).nullable().optional(),
    alternate_titles: z
      .array(z.object({ title: z.string().min(1).max(500), type: z.string().max(10).nullable().optional() }).strict())
      .max(100)
      .optional(),
    recordings: z.array(CatalogRecordingSchema).max(500).optional(),
  })
  .strict();

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
