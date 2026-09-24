import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import {
  CONTRACT_BUILDER_DENIED,
  decideContractAccess,
  makeContractGate,
  type ContractAccessInputs,
} from "./contract-access.server";
import {
  coreDeleteContract,
  coreGetBusinessProfile,
  coreGetContract,
  coreListContracts,
  coreSaveBusinessProfile,
  coreSaveContract,
} from "./contracts.core";
import { PLANS } from "./plans";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = new Date(Date.now() + 86_400_000 * 30).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const entitled = (over: Partial<ContractAccessInputs> = {}): ContractAccessInputs => ({
  isSuperAdmin: false,
  workspace: { id: WS, status: "active" },
  membershipStatus: "active",
  entitlement: { plan_id: "growth", status: "active", access_expiry_date: future, workspace_id: WS },
  ...over,
});
const withEnt = (e: Partial<NonNullable<ContractAccessInputs["entitlement"]>>) =>
  entitled({ entitlement: { ...entitled().entitlement!, ...e } });

/** Recording fake of the database client: every table op is captured. */
function fakeDb() {
  const ops: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "order", "maybeSingle", "single"]) {
      chain[op] = (...args: unknown[]) => {
        ops.push({ table, op, args });
        return chain;
      };
    }
    chain.then = (res: (v: unknown) => unknown) => res({ data: op0(table), error: null });
    return chain;
  };
  const op0 = (table: string) => (table === "contracts" ? [{ id: "c1" }] : { id: "p1" });
  return { db: { from: vi.fn(from) } as any, ops };
}

const profile = {
  legal_name: "Fictional Records Ltd", trading_name: "", registration_number: "", address: "",
  contact_email: "", contact_phone: "", signatory_name: "", signatory_title: "",
  default_currency: "TTD", governing_law: "Republic of Trinidad and Tobago",
};
const contract = { template_id: "t1", template_title: "T", title: "X", counterparty: "", values: {}, markGenerated: false };

// Inputs that try to smuggle another user's / workspace's identifiers.
const hostile = { user_id: OTHER_USER, workspace_id: OTHER_WS };
const ACTIONS = {
  getBusinessProfile: (d: any) => coreGetBusinessProfile(d),
  saveBusinessProfile: (d: any) => coreSaveBusinessProfile(d, { ...profile, ...hostile } as any),
  listContracts: (d: any) => coreListContracts(d),
  getContract: (d: any) => coreGetContract(d, { id: "someone-elses-contract", ...hostile } as any),
  saveContract: (d: any) => coreSaveContract(d, { ...contract, id: "someone-elses-contract", ...hostile } as any),
  deleteContract: (d: any) => coreDeleteContract(d, { id: "someone-elses-contract", ...hostile } as any),
} as const;

const DENIED_CASES: [string, ContractAccessInputs][] = [
  ["no workspace / no plan", { isSuperAdmin: false, workspace: null, membershipStatus: null, entitlement: null }],
  ["no plan", entitled({ entitlement: null })],
  ["suspended member", entitled({ membershipStatus: "suspended" })],
  ["removed member", entitled({ membershipStatus: "removed" })],
  ["expired plan", withEnt({ access_expiry_date: past })],
  ["expired status", withEnt({ status: "expired" })],
  ["cancelled plan", withEnt({ status: "cancelled" })],
  ["pending plan", withEnt({ status: "pending" })],
  ["suspended plan", withEnt({ status: "suspended" })],
  ["unknown plan", withEnt({ plan_id: "platinum-unknown" })],
  ["mismatched-workspace plan", withEnt({ workspace_id: OTHER_WS })],
  ["archived workspace", entitled({ workspace: { id: WS, status: "archived" } })],
];

describe("decideContractAccess", () => {
  it("allows every published plan (all include Contract Builder)", () => {
    for (const p of PLANS) {
      expect(p.features.contractBuilder).toBe(true);
      expect(decideContractAccess(withEnt({ plan_id: p.id })).ok).toBe(true);
    }
  });
  it("refuses an active plan without Contract Builder", () => {
    expect(decideContractAccess({ ...entitled(), planIncludes: () => false }).ok).toBe(false);
  });
  it("allows an open-ended active plan and a trial", () => {
    expect(decideContractAccess(withEnt({ access_expiry_date: null })).ok).toBe(true);
    expect(decideContractAccess(withEnt({ status: "trial" })).ok).toBe(true);
  });
  it.each(DENIED_CASES)("refuses: %s", (_n, inputs) => {
    expect(decideContractAccess(inputs).ok).toBe(false);
  });
  it("Super Admin rule: allowed even with no workspace or plan", () => {
    expect(decideContractAccess({ isSuperAdmin: true, workspace: null, membershipStatus: null, entitlement: null }).ok).toBe(true);
  });
});

describe("direct calls to all six actions without a qualifying plan", () => {
  for (const [action, call] of Object.entries(ACTIONS)) {
    describe(action, () => {
      it.each(DENIED_CASES)("refused with the plain message and no database access: %s", async (_n, inputs) => {
        const { db, ops } = fakeDb();
        const logs: string[] = [];
        const load = vi.fn(async () => inputs);
        const gate = makeContractGate(load, { log: (c) => logs.push(c) });
        await expect(call({ db, userId: ME, gate })).rejects.toThrow(CONTRACT_BUILDER_DENIED);
        await expect(call({ db, userId: ME, gate })).rejects.toHaveProperty("message", CONTRACT_BUILDER_DENIED);
        expect(db.from).not.toHaveBeenCalled();
        expect(ops).toHaveLength(0);
        // The gate is evaluated for the signed-in user, never for smuggled identifiers.
        expect(load).toHaveBeenCalledWith(ME);
        expect(load).not.toHaveBeenCalledWith(OTHER_USER);
        expect(logs.every((l) => l === "contract_builder_not_entitled")).toBe(true);
      });
      it("refused when the active plan lacks Contract Builder", async () => {
        const { db, ops } = fakeDb();
        const gate = makeContractGate(async () => entitled(), { planIncludes: () => false, log: () => {} });
        await expect(call({ db, userId: ME, gate })).rejects.toThrow(CONTRACT_BUILDER_DENIED);
        expect(ops).toHaveLength(0);
      });
      it("refused (fails closed) when entitlement lookup errors", async () => {
        const { db, ops } = fakeDb();
        const gate = makeContractGate(async () => { throw new Error("db down secret-detail"); }, { log: () => {} });
        await expect(call({ db, userId: ME, gate })).rejects.toHaveProperty("message", CONTRACT_BUILDER_DENIED);
        expect(ops).toHaveLength(0);
      });
    });
  }
});

describe("entitled users keep working", () => {
  const roles: [string, ContractAccessInputs][] = [
    ["Owner", entitled()],
    ["Staff (follows the workspace plan)", entitled()],
    ["Super Admin with no plan", { isSuperAdmin: true, workspace: null, membershipStatus: null, entitlement: null }],
  ];
  it.each(roles)("%s can read and write, scoped to their own user id", async (_n, inputs) => {
    const gate = makeContractGate(async () => inputs, { log: () => {} });
    const r = fakeDb();
    await coreListContracts({ db: r.db, userId: ME, gate });
    expect(r.ops.find((o) => o.op === "eq")?.args).toEqual(["user_id", ME]);
    const w = fakeDb();
    await coreSaveContract({ db: w.db, userId: ME, gate }, { ...contract, ...hostile } as any);
    const insert = w.ops.find((o) => o.op === "insert")!;
    expect((insert.args[0] as any).user_id).toBe(ME);
    const p = fakeDb();
    await coreSaveBusinessProfile({ db: p.db, userId: ME, gate }, { ...profile, ...hostile } as any);
    const up = p.ops.find((o) => o.op === "upsert")!;
    expect((up.args[0] as any).user_id).toBe(ME);
  });
  it("updates and deletes are limited to the caller's own rows", async () => {
    const gate = makeContractGate(async () => entitled(), { log: () => {} });
    const u = fakeDb();
    await coreSaveContract({ db: u.db, userId: ME, gate }, { ...contract, id: "c9" });
    expect(u.ops.filter((o) => o.op === "eq").map((o) => o.args)).toEqual([["id", "c9"], ["user_id", ME]]);
    const d = fakeDb();
    await coreDeleteContract({ db: d.db, userId: ME, gate }, { id: "c9" });
    expect(d.ops.filter((o) => o.op === "eq").map((o) => o.args)).toEqual([["id", "c9"], ["user_id", ME]]);
  });
});

describe("static guard", () => {
  it("every server action in contracts.functions.ts goes through the gated core", () => {
    const src = readFileSync("src/lib/contracts.functions.ts", "utf8");
    const fns = src.split("createServerFn(").slice(1);
    expect(fns.length).toBe(6);
    for (const f of fns) expect(f).toMatch(/\.handler\(async \(\{[^}]*\}\) => core\w+\(await deps\(context\)/);
    expect(src).not.toMatch(/context\.supabase\s*\n?\s*\.from/);
  });
  it("every core function runs the gate before touching the database", () => {
    const src = readFileSync("src/lib/contracts.core.ts", "utf8");
    const bodies = src.split("export async function core").slice(1);
    expect(bodies.length).toBe(6);
    for (const b of bodies) {
      const g = b.indexOf("await gate(userId)");
      expect(g).toBeGreaterThan(-1);
      expect(g).toBeLessThan(b.search(/db\s*\.from/));
    }
  });
});
