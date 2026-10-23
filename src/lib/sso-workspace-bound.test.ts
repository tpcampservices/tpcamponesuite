// Phase 1B-A workspace-bound SSO. MOCKED tests: the database client and the
// workspace resolvers are replaced with in-memory fakes. No live DB calls.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertWorkspaceInvariant,
  rolloutGateAllows,
  scopedEntitlementClaims,
  ticketPrecheck,
} from "./sso-scope.core";

const USER = "11111111-1111-4111-8111-111111111111";
const WS_PRIMARY = "aaaaaaaa-1111-4111-8111-111111111111";
const WS_SECONDARY = "bbbbbbbb-2222-4222-8222-222222222222";
const WS_UNPAID = "cccccccc-3333-4333-8333-333333333333";

type Ticket = {
  id: string; token_hash: string; user_id: string; app_slug: string;
  expires_at: string; consumed_at: string | null; workspace_id: string | null;
};
let superAdmin = false;
const db = {
  tickets: [] as Ticket[],
  workspaces: {
    [WS_PRIMARY]: { id: WS_PRIMARY, sso_eligible: true, name: "Primary" },
    [WS_SECONDARY]: { id: WS_SECONDARY, sso_eligible: false, name: "Secondary" },
    [WS_UNPAID]: { id: WS_UNPAID, sso_eligible: true, name: "Unpaid" },
  } as Record<string, { id: string; sso_eligible: boolean; name: string }>,
};

function query(table: string) {
  if (table === "profiles") {
    const p = { select: () => p, eq: () => p, maybeSingle: async () => ({ data: { email: "u@example.test", full_name: "U" }, error: null }) };
    return p as unknown as ReturnType<typeof query>;
  }
  if (table === "user_roles") {
    const r = { select: () => r, eq: async () => ({ data: superAdmin ? [{ role: "super_admin" }] : [], error: null }) };
    return r as unknown as ReturnType<typeof query>;
  }
  const filters: [string, string, unknown][] = [];
  let update: Record<string, unknown> | null = null;
  let insert: Record<string, unknown> | null = null;
  const rows = () =>
    (table === "sso_tickets" ? db.tickets : Object.values(db.workspaces)).filter((r) =>
      filters.every(([op, c, v]) => {
        const val = (r as Record<string, unknown>)[c];
        if (op === "eq") return val === v;
        if (op === "is") return val === v;
        if (op === "gt") return String(val) > String(v);
        return true;
      }),
    );
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
    is: (c: string, v: unknown) => (filters.push(["is", c, v]), q),
    gt: (c: string, v: unknown) => (filters.push(["gt", c, v]), q),
    update: (u: Record<string, unknown>) => ((update = u), q),
    insert: async (row: Record<string, unknown>) => {
      insert = row;
      db.tickets.push({ id: crypto.randomUUID(), consumed_at: null, workspace_id: null, ...row } as Ticket);
      return { error: null, insert };
    },
    maybeSingle: async () => {
      const found = rows()[0] ?? null;
      if (found && update) Object.assign(found, update);
      return { data: found, error: null };
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => query(t) },
}));

vi.mock("./access.server", () => ({
  refreshEntitlementStatus: vi.fn(async () => ({
    access_status: "active", plan_id: "growth", seats_extra: 0,
    billing_period: "annual", access_start_date: null, access_expiry_date: null,
  })),
  limitFor: () => 1,
}));

const paid: Ent = { hasAccess: true, status: "active" as const, planId: "growth", expiryDate: "2027-01-01" };
const unpaid: Ent = { hasAccess: false, status: "none" as const, planId: null, expiryDate: null };

type Ent = { hasAccess: boolean; status: "none" | "active" | "expired"; planId: string | null; expiryDate: string | null };
function authz(workspaceId: string | null, ok: boolean, reason: string | null, ent: Ent = paid) {
  return {
    authorized: ok, userId: USER, workspaceId, workspaceStatus: "active", membershipId: "m",
    appSlug: "catalog", accessLevel: ok ? "manage" : "no_access", membershipStatus: "active",
    roleKey: "owner", roleName: "Owner", isOwner: true, isPlatformSuperAdmin: superAdmin,
    permissions: ok ? ["catalog.access"] : [], entitlement: ent, legacyNoWorkspace: false,
    evaluatedAt: "x", reason,
  };
}

const scoped = vi.fn(async (_u: string, ws: string) => {
  if (ws === WS_PRIMARY) return authz(WS_PRIMARY, true, null);
  if (ws === WS_SECONDARY) return authz(WS_SECONDARY, true, null);
  if (ws === WS_UNPAID)
    return superAdmin ? authz(WS_UNPAID, true, null, unpaid) : authz(WS_UNPAID, false, "no_entitlement", unpaid);
  return authz(ws, false, "no_membership", unpaid);
});
const legacy = vi.fn(async () => authz(WS_PRIMARY, true, null));

vi.mock("./workspace.server", () => ({
  resolveAppAuthorization: (...a: unknown[]) => legacy(...(a as [])),
  resolveWorkspaceAppAuthorization: (...a: [string, string]) => scoped(...a),
  resolveBackingWorkspace: async () => null,
  reasonCode: (r: string | null) => (r ? r.toUpperCase() : null),
}));

process.env.TPCAMP_SSO_KEY = "k".repeat(40);
const sso = await import("./sso.server");

async function sha(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function seedTicket(token: string, ws: string | null, opts: Partial<Ticket> = {}) {
  db.tickets.push({
    id: crypto.randomUUID(), token_hash: await sha(token), user_id: USER, app_slug: "catalog",
    expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null, workspace_id: ws, ...opts,
  });
}
function claimsOf(assertion: string) {
  const b = assertion.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b));
}

beforeEach(() => {
  db.tickets.length = 0;
  superAdmin = false;
  scoped.mockClear();
  legacy.mockClear();
});

describe("issuance", () => {
  it("new tickets always carry the workspace id", async () => {
    await sso.mintTicket(USER, "catalog", WS_PRIMARY);
    expect(db.tickets[0].workspace_id).toBe(WS_PRIMARY);
  });
  it("rejects a missing or malformed workspace id", async () => {
    await expect(sso.mintTicket(USER, "catalog", "" as string)).rejects.toThrow();
    await expect(sso.mintTicket(USER, "catalog", "not-a-uuid")).rejects.toThrow();
    expect(db.tickets).toHaveLength(0);
  });
});

describe("redemption", () => {
  it("valid scoped ticket: re-authorized against exactly its workspace", async () => {
    await seedTicket("t1", WS_PRIMARY);
    const r = await sso.redeemTicket("t1", "catalog");
    expect(r.ok).toBe(true);
    expect(scoped).toHaveBeenCalledWith(USER, WS_PRIMARY, "catalog");
    expect(legacy).not.toHaveBeenCalled();
    if (r.ok) expect(claimsOf(r.assertion).workspace_id).toBe(WS_PRIMARY);
  });
  it("legacy NULL ticket uses the legacy resolver", async () => {
    await seedTicket("t2", null);
    const r = await sso.redeemTicket("t2", "catalog");
    expect(r.ok).toBe(true);
    expect(legacy).toHaveBeenCalled();
    if (r.ok) expect(claimsOf(r.assertion).ticket_scope).toBe("legacy");
  });
  it("unpaid workspace is denied before any assertion (corrected T-12)", async () => {
    await seedTicket("t3", WS_UNPAID);
    const r = await sso.redeemTicket("t3", "catalog");
    expect(r).toEqual({ ok: false, reason: "no_entitlement" });
  });
  it("unknown workspace / revoked membership: no fallback", async () => {
    await seedTicket("t4", "dddddddd-4444-4444-8444-444444444444");
    const r = await sso.redeemTicket("t4", "catalog");
    expect(r.ok).toBe(false);
    expect(legacy).not.toHaveBeenCalled();
  });
  it("rollout gate: sso_eligible=false workspace is refused at redemption", async () => {
    await seedTicket("t5", WS_SECONDARY);
    const r = await sso.redeemTicket("t5", "catalog");
    expect(r).toEqual({ ok: false, reason: "workspace_not_enabled" });
  });
  it("wrong app audience", async () => {
    await seedTicket("t6", WS_PRIMARY);
    expect(await sso.redeemTicket("t6", "splits")).toEqual({ ok: false, reason: "wrong_app" });
  });
  it("expired ticket", async () => {
    await seedTicket("t7", WS_PRIMARY, { expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await sso.redeemTicket("t7", "catalog")).toEqual({ ok: false, reason: "expired" });
  });
  it("replay is rejected", async () => {
    await seedTicket("t8", WS_PRIMARY);
    expect((await sso.redeemTicket("t8", "catalog")).ok).toBe(true);
    expect(await sso.redeemTicket("t8", "catalog")).toEqual({ ok: false, reason: "already_used" });
  });
  it("concurrent redemption: exactly one succeeds", async () => {
    await seedTicket("t9", WS_PRIMARY);
    const rs = await Promise.all([sso.redeemTicket("t9", "catalog"), sso.redeemTicket("t9", "catalog")]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });
  it("Super Admin on unpaid workspace: explicit override, no fictitious plan", async () => {
    superAdmin = true;
    await seedTicket("t10", WS_UNPAID);
    const r = await sso.redeemTicket("t10", "catalog");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = claimsOf(r.assertion);
      expect(c.has_access).toBe(true);
      expect(c.plan_id).toBeNull();
      expect(c.status).toBe("none");
      expect(c.super_admin_override).toBe(true);
      expect(r.entitlement.planId).toBeNull();
    }
  });
});

describe("live authorization", () => {
  it("scoped: evaluates exactly the requested workspace", async () => {
    const r = await sso.scopedAuthorizationFor(USER, "catalog", WS_PRIMARY);
    expect(r.authorized).toBe(true);
    expect(r.workspace_id).toBe(WS_PRIMARY);
  });
  it("scoped: rollout gate blocks secondary workspaces", async () => {
    const r = await sso.scopedAuthorizationFor(USER, "catalog", WS_SECONDARY);
    expect(r.authorized).toBe(false);
    expect(r.reason_code).toBe("WORKSPACE_NOT_ENABLED");
  });
  it("scoped: unpaid workspace denied, no fallback", async () => {
    const r = await sso.scopedAuthorizationFor(USER, "catalog", WS_UNPAID);
    expect(r.authorized).toBe(false);
    expect(r.workspace_id).toBe(WS_UNPAID);
    expect(legacy).not.toHaveBeenCalled();
  });
  it("legacy: unchanged resolver path", async () => {
    const r = await sso.authorizationFor(USER, "catalog");
    expect(r.workspace_id).toBe(WS_PRIMARY);
    expect(scoped).not.toHaveBeenCalled();
  });
});

describe("pure rules", () => {
  it("gate fails closed", () => {
    expect(rolloutGateAllows(true)).toBe(true);
    expect(rolloutGateAllows(false)).toBe(false);
    expect(rolloutGateAllows(null)).toBe(false);
  });
  it("entitlement claims come from the workspace only", () => {
    expect(scopedEntitlementClaims(unpaid, false)).toEqual({
      has_access: false, plan_id: null, status: "none", super_admin_override: false,
    });
  });
  it("workspace invariant", () => {
    expect(assertWorkspaceInvariant(WS_PRIMARY, WS_PRIMARY)).toBe(true);
    expect(assertWorkspaceInvariant(WS_PRIMARY, WS_SECONDARY)).toBe(false);
    expect(assertWorkspaceInvariant(null, null)).toBe(false);
  });
  it("precheck", () => {
    expect(ticketPrecheck(null, "catalog", 0)).toBe("invalid");
  });
});
