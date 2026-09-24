import { CATALOG_LIMITS, catalogRelationshipIssues, feedIssues, schemaForApp } from "./registration-feed.contract";
import {
  authenticateFeed,
  isJsonContentType,
  loadFeedConfig,
  readBodyLimited,
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

export type FeedDeps = {
  workspaceActive(id: string): Promise<boolean>;
  entitled(id: string, app: FeedApp): Promise<boolean>;
  workInOtherWorkspace(workUid: string, workspaceId: string): Promise<boolean>;
  boundSourceRecord(workspaceId: string, workUid: string, app: FeedApp): Promise<string | null>;
  ingest(i: IngestInput): Promise<{ snapshotId: string | null; duplicate: boolean; conflict?: boolean }>;
  log(msg: string, fields: Record<string, string>): void;
};

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const UNAUTHORIZED = () => json({ error: "unauthorized" }, 401);

export async function handleSourceFeed(request: Request, env: EnvSource, deps: FeedDeps): Promise<Response> {
  // 1–5: configuration + header-only authentication. The body is not touched.
  const config = loadFeedConfig(env);
  const auth = authenticateFeed(request.headers, config);
  if (!auth.ok) {
    deps.log("registration feed rejected", { source: "unknown", code: auth.reason });
    return auth.reason === "misconfigured" ? json({ error: "feed_misconfigured" }, 503) : UNAUTHORIZED();
  }
  const app = auth.app;
  const logOk = (code: string) => deps.log("registration feed rejected", { source: app, env: auth.env, code });

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
  let raw: unknown;
  try {
    raw = JSON.parse(body.text);
  } catch {
    return json({ error: "invalid_body", issues: [{ path: "", message: "Body must be JSON." }] }, 400);
  }
  const parsed = schemaForApp(app).safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: feedIssues(parsed.error) }, 400);
  const ev = parsed.data;
  if (ev.event_type === "catalog.work.snapshot") {
    const rel = catalogRelationshipIssues(ev.payload);
    if (rel.length) return json({ error: "invalid_body", issues: rel }, 400);
  }
  if (!config.ok || !workspacePermitted(config, auth.env, ev.workspace_id)) {
    logOk("workspace_not_permitted");
    return json({ error: "workspace_not_permitted" }, 403);
  }

  try {
    if (!(await deps.workspaceActive(ev.workspace_id))) return json({ error: "workspace_not_found" }, 404);
    if (!(await deps.entitled(ev.workspace_id, app))) return json({ error: "app_not_entitled" }, 403);
    if (await deps.workInOtherWorkspace(ev.work_uid, ev.workspace_id)) return json({ error: "work_workspace_conflict" }, 409);
    const bound = await deps.boundSourceRecord(ev.workspace_id, ev.work_uid, app);
    if (bound && bound !== ev.source_record_id) return json({ error: "source_record_conflict" }, 409);

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
    if (result.conflict) return json({ error: "event_id_reused" }, 409);
    return json({ ok: true, snapshot_id: result.snapshotId, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
  } catch {
    logOk("server_error");
    return json({ error: "server_error" }, 500);
  }
}
