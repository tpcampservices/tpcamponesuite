/**
 * Phase 5B.1A — ownership receiver hardening. Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { exampleCatalogEvent, exampleSplitsEvent } from "../../docs/registration-feed/examples";
import { handleSourceFeed, type FeedDeps, type IngestInput, type IngestResult } from "./registration-feed-handler.server";
import { signFeedBody } from "./registration-auth.server";
import {
  buildUrp,
  canonicalJson,
  classifyOwnershipEvent,
  parseOwnershipRevision,
  pickCurrentOwnership,
  validateUrp,
  type SourceSnapshot,
} from "./registration-core";
import { SplitsFeedEventSchema } from "./registration-feed.contract";

// Fictional test-only values. Not real credentials.
const K = { catDev: "catDEV_" + "a".repeat(40), splDev: "splDEV_" + "c".repeat(40), splProd: "splPRD_" + "d".repeat(40) };
const WS_A = exampleSplitsEvent.workspace_id as string;
const WS_B = "00000000-0000-4000-8000-00000000000b";
const env = () => ({
  REG_FEED_KEY_CATALOG_DEV: K.catDev,
  REG_FEED_KEY_SPLITS_DEV: K.splDev,
  REG_FEED_KEY_SPLITS_PROD: K.splProd,
  REG_FEED_TEST_WORKSPACES: `${WS_A},${WS_B}`,
});
const NOW = 1_790_000_000_000;

type Snap = SourceSnapshot & { workspace: string; work: string; event_id: string | null; checksum: string };

/** In-memory store with the same rules as ingestSourceSnapshot (workspace + work scoped). */
function store() {
  const snaps: Snap[] = [];
  const bindings = new Map<string, string>();
  let n = 0;
  const deps: FeedDeps = {
    workspaceActive: async () => true,
    entitled: async () => true,
    workInOtherWorkspace: async () => false,
    boundSourceRecord: async (ws, uid) => bindings.get(`${ws}|${uid}`) ?? null,
    ingest: async (i: IngestInput): Promise<IngestResult> => {
      const checksum = createHash("sha256")
        .update(canonicalJson({ payload: i.payload, source_revision: i.sourceRevision, ownership_revision: i.ownershipRevision, work_uid: i.workUid }))
        .digest("hex");
      const prior = snaps.filter((s) => s.workspace === i.workspaceId && s.work === i.workUid);
      const d = classifyOwnershipEvent(prior, { eventId: i.eventId, checksum, revision: parseOwnershipRevision(i.ownershipRevision)! });
      if (d === "event_id_reused") return { snapshotId: null, duplicate: false, conflict: true };
      if (d === "ownership_revision_conflict") return { snapshotId: null, duplicate: false, revisionConflict: true };
      if (d === "duplicate") return { snapshotId: "dup", duplicate: true };
      const id = `snap-${++n}`;
      snaps.push({
        id, source_app: "splits", source_revision: i.sourceRevision, ownership_revision: i.ownershipRevision,
        payload: JSON.parse(JSON.stringify(i.payload)), received_at: String(n).padStart(6, "0"), source_entity_id: i.entityId,
        workspace: i.workspaceId, work: i.workUid, event_id: i.eventId, checksum,
      });
      bindings.set(`${i.workspaceId}|${i.workUid}`, bindings.get(`${i.workspaceId}|${i.workUid}`) ?? i.entityId);
      return { snapshotId: id, duplicate: false, stale: d === "stale" };
    },
    log: () => {},
    now: () => NOW,
  };
  const current = (ws: string, work = exampleSplitsEvent.work_uid as string) =>
    pickCurrentOwnership(snaps.filter((s) => s.workspace === ws && s.work === work));
  return { deps, snaps, current };
}

function event(rev: string, over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) {
  const e = JSON.parse(JSON.stringify(exampleSplitsEvent));
  return { ...e, event_id: `evt-${rev}-${Math.random().toString(36).slice(2, 8)}`, ownership_revision: rev, ...over, payload: { ...e.payload, ...payloadOver } };
}
function signed(ev: object, opts: { key?: string; ts?: number; tamper?: (raw: string) => string; eventId?: string; app?: string } = {}) {
  const raw = JSON.stringify(ev);
  const ts = String(Math.floor((opts.ts ?? NOW) / 1000));
  const h = new Headers({
    "content-type": "application/json",
    "x-tpcamp-app": opts.app ?? "splits",
    "x-tp-camp-timestamp": ts,
    "x-tp-camp-event-id": opts.eventId ?? (ev as { event_id: string }).event_id,
    "x-tp-camp-signature": signFeedBody(opts.key ?? K.splDev, ts, raw),
  });
  return new Request("http://x/api/public/registration/source", { method: "POST", headers: h, body: opts.tamper ? opts.tamper(raw) : raw });
}
async function send(s: ReturnType<typeof store>, r: Request, e = env()) {
  const res = await handleSourceFeed(r, e, s.deps);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, text: "" };
}

describe("ownership revisions", () => {
  it("1. revision 10 supersedes revision 9", async () => {
    const s = store();
    expect((await send(s, signed(event("9")))).status).toBe(201);
    expect(await send(s, signed(event("10", {}, { writers: [{ id: "w", legalName: "New Owner", sharePercent: 100 }] })))).toMatchObject({ status: 201, body: { outcome: "accepted" } });
    expect(s.current(WS_A)?.ownership_revision).toBe("10");
  });
  it("2. revision 9 arriving after 10 is stale, kept as history, never current", async () => {
    const s = store();
    await send(s, signed(event("10")));
    const r = await send(s, signed(event("9", {}, { writers: [{ id: "w", legalName: "Old Owner", sharePercent: 100 }] })));
    expect(r).toMatchObject({ status: 200, body: { ok: true, outcome: "stale", stale: true } });
    expect(s.snaps.map((x) => x.ownership_revision)).toEqual(["10", "9"]);
    expect(s.current(WS_A)?.ownership_revision).toBe("10");
  });
  it("3. text ordering never lets '9' beat '10' (or '99' beat '100')", () => {
    const snaps = [
      { ownership_revision: "10", received_at: "1" },
      { ownership_revision: "9", received_at: "2" },
    ];
    expect(pickCurrentOwnership(snaps)?.ownership_revision).toBe("10");
    expect(pickCurrentOwnership([{ ownership_revision: "100", received_at: "1" }, { ownership_revision: "99", received_at: "2" }])?.ownership_revision).toBe("100");
    expect(classifyOwnershipEvent([{ event_id: "a", checksum: "x", ownership_revision: "10" }], { eventId: "b", checksum: "y", revision: 9 })).toBe("stale");
    expect(SplitsFeedEventSchema.safeParse(event("09")).success).toBe(false);
    expect(SplitsFeedEventSchema.safeParse(event("own-rev-2")).success).toBe(false);
  });
  it("4. revision gaps are accepted", async () => {
    const s = store();
    await send(s, signed(event("2")));
    expect((await send(s, signed(event("47")))).status).toBe(201);
    expect(s.current(WS_A)?.ownership_revision).toBe("47");
  });
  it("5. the same event is idempotent", async () => {
    const s = store();
    const e = event("3");
    await send(s, signed(e));
    expect(await send(s, signed(e))).toMatchObject({ status: 200, body: { outcome: "duplicate", duplicate: true } });
    expect(s.snaps).toHaveLength(1);
  });
  it("6. same event id with different content is refused; same revision with different content too", async () => {
    const s = store();
    const e = event("3");
    await send(s, signed(e));
    expect(await send(s, signed({ ...e, payload: { ...e.payload, writers: [{ id: "w", legalName: "X", sharePercent: 100 }] } }))).toMatchObject({ status: 409, body: { outcome: "conflict", error: "event_id_reused" } });
    expect(await send(s, signed(event("3", {}, { writers: [{ id: "w", legalName: "Y", sharePercent: 100 }] })))).toMatchObject({ status: 409, body: { error: "ownership_revision_conflict" } });
    expect(s.snaps).toHaveLength(1);
  });
});

describe("validated -> unvalidated", () => {
  it("7–9. a newer unvalidated snapshot becomes current; the profile blocks; the validated copy stays unchanged", async () => {
    const s = store();
    await send(s, signed(event("5")));
    const before = JSON.stringify(s.snaps[0]);
    expect((await send(s, signed(event("6", {}, { ownership_validated_at: null })))).status).toBe(201);
    const cur = s.current(WS_A)!;
    expect(cur.ownership_revision).toBe("6");
    const issues = validateUrp(buildUrp("W", null, cur));
    expect(issues.some((i) => i.code === "ownership_not_validated" && i.severity === "blocking")).toBe(true);
    expect(buildUrp("W", null, cur).source_refs.ownership_validated_at).toBeNull();
    expect(JSON.stringify(s.snaps[0])).toBe(before);
    expect(s.snaps[0].payload.ownership_validated_at).toBe("2026-09-20T09:00:00Z");
  });
  it("profile keeps using the newer revision when an older one arrives late", async () => {
    const s = store();
    await send(s, signed(event("8", {}, { ownership_validated_at: null })));
    await send(s, signed(event("7")));
    expect(buildUrp("W", null, s.current(WS_A)).source_refs.ownership_revision).toBe("8");
  });
});

describe("binding and workspace isolation", () => {
  it("10. a different sheet for a bound work is refused and stores nothing", async () => {
    const s = store();
    await send(s, signed(event("1")));
    const r = await send(s, signed(event("2", { source_record_id: "spl-sheet-OTHER" })));
    expect(r).toMatchObject({ status: 409, body: { outcome: "conflict", error: "source_record_conflict" } });
    expect(s.snaps).toHaveLength(1);
  });
  it("11–12. revisions in workspace B never affect workspace A for the same work_uid and sheet id", async () => {
    const s = store();
    await send(s, signed(event("50", { workspace_id: WS_B })));
    expect(await send(s, signed(event("3")))).toMatchObject({ status: 201, body: { outcome: "accepted" } });
    expect(s.current(WS_A)?.ownership_revision).toBe("3");
    expect(s.current(WS_B)?.ownership_revision).toBe("50");
  });
});

describe("legal name", () => {
  it("13. missing, blank or stage-name-only writers are refused, never substituted", async () => {
    const s = store();
    for (const w of [{ id: "w", sharePercent: 100 }, { id: "w", legalName: "   ", sharePercent: 100 }, { id: "w", stageName: "DJ Example", sharePercent: 100 }]) {
      expect(await send(s, signed(event("4", {}, { writers: [w] })))).toMatchObject({ status: 400, body: { outcome: "invalid" } });
    }
    expect(s.snaps).toHaveLength(0);
    const u = buildUrp("W", null, { id: "x", source_app: "splits", source_revision: "1", ownership_revision: "1", received_at: "", payload: { writers: [{ name: "Alias", stageName: "Alias", sharePercent: 100 }] } });
    expect(u.writers[0].name).toBeNull();
  });
});

describe("HMAC authentication", () => {
  it("14. a valid signature succeeds", async () => {
    expect((await send(store(), signed(event("1")))).status).toBe(201);
  });
  it("15–19. bad signature, expired timestamp, altered body, wrong key and Catalog key all get the same 401", async () => {
    const s = store();
    const e = event("1");
    const cases = [
      signed(e, { tamper: (r) => r }), // placeholder replaced below
    ];
    cases.length = 0;
    const badSig = signed(e);
    badSig.headers.set("x-tp-camp-signature", "0".repeat(64));
    cases.push(
      badSig,
      signed(e, { ts: NOW - 301_000 }),
      signed(e, { ts: NOW + 301_000 }),
      signed(e, { tamper: (r) => r.replace("Alex Example", "Alex Exampl3") }),
      signed(e, { key: "splOTHER_" + "f".repeat(40) }),
      signed(e, { key: K.catDev }),
      signed(e, { key: K.catDev, app: "catalog" }),
      signed(e, { eventId: "some-other-event" }),
      signed(e, { key: K.splProd }), // production key while production is disabled
    );
    const results = [];
    for (const r of cases) results.push(await send(s, r));
    for (const r of results) expect(r).toMatchObject({ status: 401, body: { outcome: "unauthorized", error: "unauthorized" } });
    expect(new Set(results.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(s.snaps).toHaveLength(0);
  });
  it("20. responses and logs never contain secret values or signatures", async () => {
    const logs: string[] = [];
    const s = store();
    s.deps.log = (m, f) => logs.push(m + JSON.stringify(f));
    const bodies: string[] = [];
    for (const r of [signed(event("1"), { key: "wrong_" + "z".repeat(40) }), signed(event("1"), { ts: 1 }), signed({ nope: true })]) {
      const res = await handleSourceFeed(r, env(), s.deps);
      bodies.push(await res.text());
    }
    const all = bodies.join("\n") + logs.join("\n");
    for (const v of Object.values(K)) expect(all).not.toContain(v);
    expect(all).not.toMatch(/[0-9a-f]{64}/);
  });
  it("Catalog fixed-key authentication is unchanged", async () => {
    const h = new Headers({ "content-type": "application/json", "x-tpcamp-app": "catalog", "x-tpcamp-key": K.catDev });
    const res = await handleSourceFeed(new Request("http://x/", { method: "POST", headers: h, body: JSON.stringify(exampleCatalogEvent) }), env(), {
      ...store().deps,
      ingest: async () => ({ snapshotId: "c", duplicate: false }),
    });
    expect(res.status).toBe(201);
  });
});
