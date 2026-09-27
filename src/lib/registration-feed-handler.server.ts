import { CATALOG_LIMITS, catalogRelationshipIssues, feedIssues, schemaForApp } from "./registration-feed.contract";
import {
  authenticateFeed,
  isJsonContentType,
  loadFeedConfig,
  precheckSplitsHmac,
  readBodyLimited,
  verifySplitsHmac,
  HMAC_HEADERS,
  workspacePermitted,
  type EnvSource,
  type FeedApp,
} from "./registration-auth.server";

export type IngestInput = {
  workspaceId: string;
  sourceApp: FeedApp;
  entityType: string;
  entityId: string;
  workUid: string;
  sourceRevision: string | null;
  ownershipRevision: string | null;
  eventId: string | null;
  payload: Record<string, unknown>;
};

export type IngestResult = {
  snapshotId: string | null;
  duplicate: boolean;
  conflict?: boolean;
  /** Older ownership revision: kept as history, never current. */
  stale?: boolean;
  /** Same ownership revision with different content. */
  revisionConflict?: boolean;
};

export type FeedDeps = {
  workspaceActive(id: string): Promise<boolean>;
  entitled(id: string, app: FeedApp): Promise<boolean>;
  workInOtherWorkspace(workUid: string, workspaceId: string): Promise<boolean>;
  boundSourceRecord(workspaceId: string, workUid: string, app: FeedApp): Promise<string | null>;
  ingest(i: IngestInput): Promise<IngestResult>;
  log(msg: string, fields: Record<string, string>): void;
  /** Clock for signature windows (ms). Defaults to Date.now. */
  now?(): number;
};

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const UNAUTHORIZED = () => json({ outcome: "unauthorized", error: "unauthorized" }, 401);
const conflict = (error: string) => json({ outcome: "conflict", error }, 409);
const invalid = (issues: { path: string; message: string }[]) => json({ outcome: "invalid", error: "invalid_body", issues }, 400);

export async function handleSourceFeed(request: Request, env: EnvSource, deps: FeedDeps): Promise<Response> {
  // 1–5: configuration + header-only authentication. The body is not touched.
  const config = loadFeedConfig(env);
  if (!config.ok) {
    deps.log("registration feed rejected", { source: "unknown", code: "misconfigured" });
    return json({ error: "feed_misconfigured" }, 503);
  }
  // Split Sheets authenticates by HMAC signature only; Catalog by its key header.
  const signed = request.headers.get("x-tpcamp-app") === "splits" || request.headers.has(HMAC_HEADERS.signature);
  const pre = signed ? precheckSplitsHmac(request.headers, config, (deps.now ?? Date.now)()) : null;
  const auth = signed ? null : authenticateFeed(request.headers, config);
  if ((pre && !pre.ok) || (auth && !auth.ok)) {
    deps.log("registration feed rejected", { source: "unknown", code: "unauthorized" });
    return UNAUTHORIZED();
  }
  const app: FeedApp = auth && auth.ok ? auth.app : "splits";
  let feedEnv = auth && auth.ok ? auth.env : "pending";
  const logOk = (code: string) => deps.log("registration feed rejected", { source: app, env: feedEnv, code });

  if (!isJsonContentType(request.headers.get("content-type"))) {
    logOk("unsupported_media_type");
    return json({ error: "unsupported_media_type" }, 415);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > CATALOG_LIMITS.body_bytes) {
    logOk("payload_too_large");
    return json({ error: "payload_too_large", limit_bytes: CATALOG_LIMITS.body_bytes }, 413);
  }
  const body = await readBodyLimited(request, CATALOG_LIMITS.body_bytes);
  if (!body.ok) {
    logOk("payload_too_large");
    return json({ error: "payload_too_large", limit_bytes: CATALOG_LIMITS.body_bytes }, 413);
  }
  if (pre && pre.ok) {
    const v = verifySplitsHmac(config, pre, body.text);
    if (!v.ok) {
      deps.log("registration feed rejected", { source: "unknown", code: "unauthorized" });
      return UNAUTHORIZED();
    }
    feedEnv = v.env;
  }
  const authEnv = feedEnv as "development" | "production";
  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return invalid([{ path: "", message: "Body must be JSON." }]);
  }
  const parsed = schemaForApp(app).safeParse(raw);
  if (!parsed.success) return invalid(feedIssues(parsed.error));
  const ev = parsed.data;
  // The signed event id header must name this exact event.
  if (pre && pre.ok && pre.eventId !== ev.event_id) {
    logOk("event_id_header_mismatch");
    return UNAUTHORIZED();
  }
  if (ev.event_type === "catalog.work.snapshot") {
    const rel = catalogRelationshipIssues(ev.payload);
    if (rel.length) return invalid(rel);
  }
  if (!config.ok || !workspacePermitted(config, authEnv, ev.workspace_id)) {
    logOk("workspace_not_permitted");
    return json({ error: "workspace_not_permitted" }, 403);
  }

  try {
    if (!(await deps.workspaceActive(ev.workspace_id))) return json({ error: "workspace_not_found" }, 404);
    if (!(await deps.entitled(ev.workspace_id, app))) return json({ error: "app_not_entitled" }, 403);
    if (await deps.workInOtherWorkspace(ev.work_uid, ev.workspace_id)) return conflict("work_workspace_conflict");
    const bound = await deps.boundSourceRecord(ev.workspace_id, ev.work_uid, app);
    if (bound && bound !== ev.source_record_id) return conflict("source_record_conflict");

    const result = await deps.ingest({
      workspaceId: ev.workspace_id,
      sourceApp: app,
      entityType: app === "catalog" ? "work" : "composition_sheet",
      entityId: ev.source_record_id,
      workUid: ev.work_uid,
      sourceRevision: ev.source_revision,
      ownershipRevision: "ownership_revision" in ev ? (ev.ownership_revision as string | null) : null,
      eventId: ev.event_id,
      payload: ev.payload as Record<string, unknown>,
    });
    if (result.conflict) return conflict("event_id_reused");
    if (result.revisionConflict) return conflict("ownership_revision_conflict");
    if (result.stale) return json({ ok: true, outcome: "stale", snapshot_id: result.snapshotId, duplicate: false, stale: true }, 200);
    return json(
      { ok: true, outcome: result.duplicate ? "duplicate" : "accepted", snapshot_id: result.snapshotId, duplicate: result.duplicate },
      result.duplicate ? 200 : 201,
    );
  } catch {
    logOk("server_error");
    return json({ error: "server_error" }, 500);
  }
}
