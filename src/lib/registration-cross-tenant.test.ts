import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { exampleCatalogEvent, exampleSplitsEvent } from "../../docs/registration-feed/examples";
import { handleSourceFeed, type FeedDeps, type IngestInput } from "./registration-feed-handler.server";
import { signFeedBody } from "./registration-auth.server";

// Fictional test-only values. Not real credentials or real workspaces.
const K = {
  catDev: "catDEV_" + "a".repeat(40),
  splDev: "splDEV_" + "c".repeat(40),
  splProd: "splPRD_" + "d".repeat(40),
};
const TEST_WS = exampleCatalogEvent.workspace_id as string; // allow-listed
const OTHER_TEST_WS = "99999999-8888-4777-8666-555555555555"; // a test workspace NOT listed
const CUSTOMER_WS = "11111111-2222-4333-8444-555555555555"; // stands in for a real customer
const env = (extra: Record<string, string> = {}) =>
  ({
    REG_FEED_KEY_CATALOG_DEV: K.catDev,
    REG_FEED_KEY_SPLITS_DEV: K.splDev,
    REG_FEED_KEY_SPLITS_PROD: K.splProd,
    REG_FEED_TEST_WORKSPACES: TEST_WS,
    ...extra,
  }) as Record<string, string | undefined>;

/** In-memory store: records every persistent write, scoped per workspace. */
function store() {
  const writes: IngestInput[] = [];
  const works = new Map<string, { ws: string; split?: string; catalog?: string }>();
  const deps: FeedDeps = {
    workspaceActive: async () => true,
    entitled: async () => true,
    workInOtherWorkspace: async (uid, ws) => !!works.get(uid) && works.get(uid)!.ws !== ws,
    boundSourceRecord: async (ws, uid, app) => {
      const w = works.get(uid);
      if (!w || w.ws !== ws) return null;
      return (app === "catalog" ? w.catalog : w.split) ?? null;
    },
    ingest: async (i) => {
      writes.push(i);
      const w = works.get(i.workUid) ?? { ws: i.workspaceId };
      if (i.sourceApp === "splits") w.split ??= i.entityId;
      else w.catalog ??= i.entityId;
      works.set(i.workUid, w);
      return { snapshotId: "snap-" + writes.length, duplicate: false };
    },
    log: () => {},
  };
  return { deps, writes, works };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function splitsEvent(ws: string, over: Record<string, unknown> = {}) {
  return { ...clone(exampleSplitsEvent), workspace_id: ws, ...over } as Record<string, any>;
}
function signed(raw: string, eventId: string, key = K.splDev) {
  const ts = String(Math.floor(Date.now() / 1000));
  return new Headers({
    "content-type": "application/json",
    "x-tpcamp-app": "splits",
    "x-tp-camp-timestamp": ts,
    "x-tp-camp-event-id": eventId,
    "x-tp-camp-signature": signFeedBody(key, ts, raw),
  });
}
async function send(body: Record<string, any>, s = store(), e = env(), key = K.splDev) {
  const raw = JSON.stringify(body);
  const res = await handleSourceFeed(new Request("http://x/", { method: "POST", headers: signed(raw, body.event_id, key), body: raw }), e, s.deps);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, s };
}

describe("registration feed: cross-tenant boundary", () => {
  it("1. valid DEV Split Sheets signature + allow-listed workspace is accepted", async () => {
    const r = await send(splitsEvent(TEST_WS));
    expect(r.status).toBe(201);
    expect(r.s.writes).toHaveLength(1);
    expect(r.s.writes[0].workspaceId).toBe(TEST_WS);
  });

  it("2. valid DEV signature + a test workspace that is not listed is refused with zero writes", async () => {
    const r = await send(splitsEvent(OTHER_TEST_WS));
    expect(r).toMatchObject({ status: 403, body: { error: "workspace_not_permitted" } });
    expect(r.s.writes).toHaveLength(0);
  });

  it("3. valid DEV signature + customer workspace is refused with zero writes", async () => {
    const r = await send(splitsEvent(CUSTOMER_WS));
    expect(r.status).toBe(403);
    expect(r.s.writes).toHaveLength(0);
  });

  it("4. changing only workspace_id after signing invalidates the request", async () => {
    const good = splitsEvent(TEST_WS);
    const raw = JSON.stringify(good);
    const headers = signed(raw, good.event_id);
    const tampered = JSON.stringify({ ...good, workspace_id: CUSTOMER_WS });
    const s = store();
    const res = await handleSourceFeed(new Request("http://x/", { method: "POST", headers, body: tampered }), env(), s.deps);
    expect(res.status).toBe(401);
    expect(s.writes).toHaveLength(0);
  });

  it("5. a work held by workspace A cannot be injected into workspace B", async () => {
    const s = store();
    s.works.set(exampleSplitsEvent.work_uid as string, { ws: CUSTOMER_WS, split: "other" });
    const r = await send(splitsEvent(TEST_WS), s);
    expect(r).toMatchObject({ status: 409, body: { error: "work_workspace_conflict" } });
    expect(s.writes).toHaveLength(0);
  });

  it("6. a source record bound in one workspace cannot be rebound, and bindings never cross workspaces", async () => {
    const s = store();
    expect((await send(splitsEvent(TEST_WS), s)).status).toBe(201);
    const rebind = splitsEvent(TEST_WS, { event_id: "evt-rebind-1", source_record_id: "different-sheet" });
    expect(await send(rebind, s)).toMatchObject({ status: 409, body: { error: "source_record_conflict" } });
    // The same binding looked up from another workspace returns nothing.
    expect(await s.deps.boundSourceRecord(CUSTOMER_WS, exampleSplitsEvent.work_uid as string, "splits")).toBeNull();
    expect(s.writes).toHaveLength(1);
  });

  it("7. ownership-revision history is read only within the event's own workspace", () => {
    const src = readFileSync(new URL("./registration.server.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export async function ingestSourceSnapshot"));
    const fn = body.slice(0, body.indexOf("\nexport ", 10));
    const reads = fn.split('.from("registration_source_snapshots")').slice(1).map((c) => c.split(";")[0]);
    const selects = reads.filter((c) => c.trimStart().startsWith(".select("));
    expect(selects.length).toBeGreaterThanOrEqual(3);
    for (const q of selects) expect(q).toMatch(/\.eq\("workspace_id", (input\.)?workspaceId\)/);
  });

  it("8. every refused cross-workspace attempt creates zero persistent records", async () => {
    const s = store();
    for (const ws of [OTHER_TEST_WS, CUSTOMER_WS]) await send(splitsEvent(ws), s);
    await send(splitsEvent(CUSTOMER_WS), s, env(), K.splProd); // production key while production is off
    expect(s.writes).toHaveLength(0);
    expect(s.works.size).toBe(0);
  });

  it("9. Catalog authorization is unchanged: allow-listed accepted, customer workspace refused", async () => {
    const s = store();
    const call = (ws: string) =>
      handleSourceFeed(
        new Request("http://x/", {
          method: "POST",
          headers: { "content-type": "application/json", "x-tpcamp-app": "catalog", "x-tpcamp-key": K.catDev },
          body: JSON.stringify({ ...clone(exampleCatalogEvent), workspace_id: ws }),
        }),
        env(),
        s.deps,
      );
    expect((await call(TEST_WS)).status).toBe(201);
    expect((await call(CUSTOMER_WS)).status).toBe(403);
    expect(s.writes.map((w) => w.workspaceId)).toEqual([TEST_WS]);
  });

  it("10. refusals never reveal workspace details", async () => {
    const r = await send(splitsEvent(CUSTOMER_WS));
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(CUSTOMER_WS);
    expect(text).not.toContain(TEST_WS);
    expect(Object.keys(r.body).sort()).toEqual(["error"]);
  });
});
