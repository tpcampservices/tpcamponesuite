import { describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { exampleCatalogEvent, exampleSplitsEvent } from "../../docs/registration-feed/examples";
import { handleSourceFeed, type FeedDeps, type IngestInput } from "./registration-feed-handler.server";
import { canonicalJson } from "./registration-core";

// Fictional test-only values. Not real credentials.
const K = {
  catDev: "catDEV_" + "a".repeat(40),
  catProd: "catPRD_" + "b".repeat(40),
  splDev: "splDEV_" + "c".repeat(40),
  splProd: "splPRD_" + "d".repeat(40),
  sso: "sharedSSO_" + "e".repeat(40),
};
const TEST_WS = exampleCatalogEvent.workspace_id as string;
const PROD_WS = "11111111-2222-4333-8444-555555555555";
const baseEnv = () => ({
  REG_FEED_KEY_CATALOG_DEV: K.catDev,
  REG_FEED_KEY_CATALOG_PROD: K.catProd,
  REG_FEED_KEY_SPLITS_DEV: K.splDev,
  REG_FEED_KEY_SPLITS_PROD: K.splProd,
  TPCAMP_SSO_KEY: K.sso,
  REG_FEED_TEST_WORKSPACES: ` ${TEST_WS} `,
} as Record<string, string | undefined>);

function memoryDeps() {
  const logs: string[] = [];
  const byEvent = new Map<string, string>();
  const byContent = new Set<string>();
  const foreignWorks = new Set<string>();
  const deps: FeedDeps = {
    workspaceActive: async () => true,
    entitled: async () => true,
    workInOtherWorkspace: async (uid) => foreignWorks.has(uid),
    boundSourceRecord: async () => null,
    ingest: async (i: IngestInput) => {
      const sum = createHash("sha256").update(canonicalJson({ p: i.payload, r: i.sourceRevision, o: i.ownershipRevision, w: i.workUid })).digest("hex");
      const k = `${i.workspaceId}|${i.sourceApp}|${i.eventId}`;
      if (i.eventId && byEvent.has(k)) return byEvent.get(k) === sum ? { snapshotId: "s", duplicate: true } : { snapshotId: null, duplicate: false, conflict: true };
      if (byContent.has(sum)) return { snapshotId: "s", duplicate: true };
      if (i.eventId) byEvent.set(k, sum);
      byContent.add(sum);
      return { snapshotId: "s", duplicate: false };
    },
    log: (msg, f) => logs.push(msg + " " + JSON.stringify(f)),
  };
  return { deps, logs, foreignWorks };
}

const withWs = (ev: object, ws: string) => ({ ...JSON.parse(JSON.stringify(ev)), workspace_id: ws });
function req(opts: { key?: string; app?: string; body?: BodyInit | object; type?: string | null; stream?: ReadableStream }) {
  const h = new Headers();
  if (opts.key !== undefined) h.set("x-tpcamp-key", opts.key);
  if (opts.app !== undefined) h.set("x-tpcamp-app", opts.app);
  if (opts.type !== null) h.set("content-type", opts.type ?? "application/json");
  const body = opts.stream ?? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {}));
  return new Request("http://x/api/public/registration/source", { method: "POST", headers: h, body, duplex: "half" } as RequestInit);
}
function spyStream(bytes: number) {
  const pull = vi.fn((c: ReadableStreamDefaultController) => { c.enqueue(new Uint8Array(bytes)); c.close(); });
  return { stream: new ReadableStream({ pull }, { highWaterMark: 0 }), pull };
}
const run = async (r: Request, env = baseEnv(), m = memoryDeps()) => {
  const res = await handleSourceFeed(r, env, m.deps);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, m };
};

describe("registration feed authentication", () => {
  it("1. Catalog credential + matching header is accepted", async () => {
    expect((await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }))).status).toBe(201);
  });
  it("2. Split Sheets credential + matching header is accepted", async () => {
    expect((await run(req({ key: K.splDev, app: "splits", body: withWs(exampleSplitsEvent, TEST_WS) }))).status).toBe(201);
  });
  it("3. cross-app claims are rejected", async () => {
    expect((await run(req({ key: K.catDev, app: "splits", body: exampleSplitsEvent }))).status).toBe(401);
    expect((await run(req({ key: K.splDev, app: "catalog", body: exampleCatalogEvent }))).status).toBe(401);
  });
  it("4. wrong, missing, unknown-app, revoked and shared-SSO keys all get the identical 401", async () => {
    const revoked = { ...baseEnv(), REG_FEED_REVOKED: "REG_FEED_KEY_CATALOG_DEV" };
    const cases = [
      await run(req({ key: "x".repeat(50), app: "catalog", body: exampleCatalogEvent })),
      await run(req({ app: "catalog", body: exampleCatalogEvent })),
      await run(req({ key: K.catDev, app: "operations", body: exampleCatalogEvent })),
      await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), revoked),
      await run(req({ key: K.sso, app: "catalog", body: exampleCatalogEvent })),
    ];
    for (const c of cases) expect(c).toMatchObject({ status: 401, body: { error: "unauthorized" } });
    expect(new Set(cases.map((c) => JSON.stringify(c.body))).size).toBe(1);
  });
  it("5. development credential targeting a production workspace is refused", async () => {
    const r = await run(req({ key: K.catDev, app: "catalog", body: withWs(exampleCatalogEvent, PROD_WS) }));
    expect(r).toMatchObject({ status: 403, body: { error: "workspace_not_permitted" } });
  });
  it("6. production credential: refused while disabled; cannot target a test workspace when enabled", async () => {
    expect((await run(req({ key: K.catProd, app: "catalog", body: withWs(exampleCatalogEvent, PROD_WS) }))).status).toBe(401);
    const on = { ...baseEnv(), REG_FEED_PROD_ENABLED: "true" };
    expect((await run(req({ key: K.catProd, app: "catalog", body: exampleCatalogEvent }), on)).status).toBe(403);
    expect((await run(req({ key: K.catProd, app: "catalog", body: withWs(exampleCatalogEvent, PROD_WS) }), on)).status).toBe(201);
  });
  it("7. exactly 5,000,000 bytes passes; one byte over is rejected whole", async () => {
    const base = JSON.stringify(exampleCatalogEvent);
    const exact = base + " ".repeat(5_000_000 - Buffer.byteLength(base));
    expect(Buffer.byteLength(exact)).toBe(5_000_000);
    expect((await run(req({ key: K.catDev, app: "catalog", body: exact }))).status).toBe(201);
    const over = await run(req({ key: K.catDev, app: "catalog", body: exact + " " }));
    expect(over).toMatchObject({ status: 413, body: { error: "payload_too_large" } });
  });
  it("8–9. duplicate event is 200; reused event id with different content is 409", async () => {
    const m = memoryDeps();
    expect((await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), baseEnv(), m)).status).toBe(201);
    const dup = await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), baseEnv(), m);
    expect(dup).toMatchObject({ status: 200, body: { duplicate: true } });
    const changed = withWs(exampleCatalogEvent, TEST_WS);
    changed.payload.title = "Different Title";
    expect(await run(req({ key: K.catDev, app: "catalog", body: changed }), baseEnv(), m)).toMatchObject({ status: 409, body: { error: "event_id_reused" } });
  });
  it("10. workspace conflict", async () => {
    const m = memoryDeps();
    m.foreignWorks.add(exampleCatalogEvent.work_uid as string);
    expect(await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), baseEnv(), m)).toMatchObject({ status: 409, body: { error: "work_workspace_conflict" } });
  });
  it("11. logs never contain credential values", async () => {
    const m = memoryDeps();
    for (const [key, app] of [[K.catDev, "splits"], [K.sso, "catalog"], [K.catProd, "catalog"], ["y".repeat(50), "catalog"]])
      await run(req({ key, app, body: exampleCatalogEvent }), baseEnv(), m);
    await run(req({ key: K.catDev, app: "catalog", body: withWs(exampleCatalogEvent, PROD_WS) }), baseEnv(), m);
    const all = m.logs.join("\n");
    for (const v of Object.values(K)) expect(all).not.toContain(v);
    expect(all).not.toMatch(/x-tpcamp-key|[0-9a-f]{64}/i);
  });
  it("12. duplicate credentials across slots fail closed for both identities", async () => {
    const env = { ...baseEnv(), REG_FEED_KEY_SPLITS_DEV: K.catDev };
    expect(await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), env)).toMatchObject({ status: 503, body: { error: "feed_misconfigured" } });
    expect(await run(req({ key: K.catDev, app: "splits", body: withWs(exampleSplitsEvent, TEST_WS) }), env)).toMatchObject({ status: 503, body: { error: "feed_misconfigured" } });
  });
  it("13. empty, short, padded, invalid-character and malformed configured credentials stay inactive", async () => {
    const bad = ["", "short", ` ${K.catDev}`, `${K.catDev} `, K.catDev.slice(0, 42), "a".repeat(40) + "!@#", "a".repeat(129), "a".repeat(40) + "é€"];
    for (const v of bad) {
      const r = await run(req({ key: v, app: "catalog", body: exampleCatalogEvent }), { ...baseEnv(), REG_FEED_KEY_CATALOG_DEV: v });
      expect(r.status).toBe(401);
    }
  });
  it("14. one invalid UUID in the test-workspace list fails closed", async () => {
    const env = { ...baseEnv(), REG_FEED_TEST_WORKSPACES: `${TEST_WS}, not-a-uuid` };
    expect(await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), env)).toMatchObject({ status: 503, body: { error: "feed_misconfigured" } });
  });
  it("15. an empty test-workspace list admits no development workspace", async () => {
    for (const v of [undefined, "", "  "]) {
      const r = await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent }), { ...baseEnv(), REG_FEED_TEST_WORKSPACES: v });
      expect(r.status).toBe(403);
    }
  });
  it("16. unauthorized request with a >5 MB body gets 401 without the body being read", async () => {
    const { stream, pull } = spyStream(5_000_001);
    const r = req({ key: "z".repeat(50), app: "catalog", stream });
    const res = await handleSourceFeed(r, baseEnv(), memoryDeps().deps);
    expect(res.status).toBe(401);
    expect(pull).not.toHaveBeenCalled();
    expect(r.bodyUsed).toBe(false);
  });
  it("17. authenticated request with unsupported content type gets 415 without the body being read", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "application/json; charset=latin1", null]) {
      const { stream, pull } = spyStream(10);
      const r = req({ key: K.catDev, app: "catalog", stream, type });
      const res = await handleSourceFeed(r, baseEnv(), memoryDeps().deps);
      expect(res.status).toBe(415);
      expect(pull).not.toHaveBeenCalled();
      expect(r.bodyUsed).toBe(false);
    }
  });
  it("18. application/json with an optional valid charset is accepted", async () => {
    for (const type of ["application/json", "application/json; charset=utf-8", "Application/JSON;charset=UTF-8"]) {
      expect((await run(req({ key: K.catDev, app: "catalog", body: exampleCatalogEvent, type }))).status).toBe(201);
    }
  });
  it("19. unknown or malicious app header is never copied into logs", async () => {
    const m = memoryDeps();
    const marker = "EVIL_MARKER_7f3a<script>";
    await run(req({ key: K.catDev, app: marker, body: exampleCatalogEvent }), baseEnv(), m);
    await run(req({ key: "q".repeat(50), app: marker, body: exampleCatalogEvent }), baseEnv(), m);
    const all = m.logs.join("\n");
    expect(all).not.toContain("EVIL_MARKER");
    expect(m.logs.every((l) => l.includes('"source":"unknown"'))).toBe(true);
  });
});
