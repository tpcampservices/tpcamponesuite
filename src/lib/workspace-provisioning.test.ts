import { describe, expect, it, vi } from "vitest";
import {
  inputHash,
  runProvision,
  sanitizeDbError,
  type ProvisionDeps,
} from "./workspace-provisioning.core";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { entitlementCoversWorkspace, isLegacySsoCandidate } from "./workspace.server";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const WS = "33333333-3333-4333-8333-333333333333";
const valid = {
  targetOwnerUserId: TARGET,
  workspaceName: "Fictional Label",
  workspaceType: "customer",
  idempotencyKey: "key_abcdefghijklmnop",
};

function deps(over: Partial<ProvisionDeps> = {}) {
  const calls: unknown[] = [];
  const audits: unknown[] = [];
  const d: ProvisionDeps = {
    isSuperAdmin: async () => true,
    callRoutine: async (a) => (calls.push(a), { data: { workspace_id: WS, slug: "s", is_existing: false }, error: null }),
    auditRejection: async (e) => void audits.push(e),
    log: () => {},
    ...over,
  };
  return { d, calls, audits };
}

describe("provisionAdditionalWorkspace core", () => {
  it("rejects unauthenticated callers without touching the database", async () => {
    const { d, calls } = deps();
    expect(await runProvision({ userId: null, email: null }, valid, d)).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(calls).toHaveLength(0);
  });

  it("rejects non-Super Admins and audits the rejection", async () => {
    const { d, calls, audits } = deps({ isSuperAdmin: async () => false });
    const r = await runProvision({ userId: ACTOR, email: null }, valid, d);
    expect(r).toEqual({ ok: false, code: "FORBIDDEN_SUPER_ADMIN_REQUIRED" });
    expect(calls).toHaveLength(0);
    expect(audits).toHaveLength(1);
  });

  it("fails closed when the role check errors", async () => {
    const { d, calls } = deps({ isSuperAdmin: async () => { throw new Error("x"); } });
    expect((await runProvision({ userId: ACTOR, email: null }, valid, d)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("actor comes from the session, never from input", async () => {
    const { d, calls } = deps();
    const r = await runProvision({ userId: ACTOR, email: "a@x.test" }, { ...valid, actorUserId: TARGET }, d);
    expect(r).toEqual({ ok: false, code: "INVALID_INPUT" }); // unknown keys rejected
    expect(calls).toHaveLength(0);
    await runProvision({ userId: ACTOR, email: "a@x.test" }, valid, d);
    expect((calls[0] as any)._actor_user_id).toBe(ACTOR);
  });

  it("defaults every child app to no_access", async () => {
    const { d, calls } = deps();
    await runProvision({ userId: ACTOR, email: null }, valid, d);
    expect((calls[0] as any)._app_access_levels).toEqual({
      catalog: "no_access", splits: "no_access", operations: "no_access", finance: "no_access", invoice: "no_access",
    });
  });

  it("rejects invalid workspace types, slugs, keys and access levels", async () => {
    const { d, calls } = deps();
    for (const bad of [
      { ...valid, workspaceType: "admin" },
      { ...valid, requestedSlug: "Bad Slug!" },
      { ...valid, idempotencyKey: "short" },
      { ...valid, appAccess: { catalog: "owner" } },
      { ...valid, targetOwnerUserId: "nope" },
    ]) {
      expect(await runProvision({ userId: ACTOR, email: null }, bad, d)).toEqual({ ok: false, code: "INVALID_INPUT" });
    }
    expect(calls).toHaveLength(0);
  });

  it("never exposes raw database errors", async () => {
    const raw = 'duplicate key value violates unique constraint "workspaces_slug_key" DETAIL: secret';
    const { d } = deps({ callRoutine: async () => ({ data: null, error: { message: raw } }) });
    const r = await runProvision({ userId: ACTOR, email: null }, valid, d);
    expect(r).toEqual({ ok: false, code: "WORKSPACE_PROVISIONING_FAILED" });
    expect(JSON.stringify(r)).not.toContain("duplicate");
  });

  it("maps routine tokens to sanitized codes", () => {
    expect(sanitizeDbError("SLUG_CONFLICT")).toBe("SLUG_ALREADY_EXISTS");
    expect(sanitizeDbError("IDEMPOTENCY_CONFLICT")).toBe("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
    expect(sanitizeDbError("CONCURRENT_REQUEST")).toBe("CONCURRENT_PROVISIONING_IN_PROGRESS");
    expect(sanitizeDbError("INVALID_TARGET_OWNER")).toBe("INVALID_TARGET_OWNER");
    expect(sanitizeDbError("UNAUTHORIZED")).toBe("FORBIDDEN_SUPER_ADMIN_REQUIRED");
    expect(sanitizeDbError("permission denied for table x")).toBe("WORKSPACE_PROVISIONING_FAILED");
  });

  it("returns the original workspace on an identical retry", async () => {
    const { d } = deps({ callRoutine: async () => ({ data: { workspace_id: WS, slug: "s", is_existing: true }, error: null }) });
    expect(await runProvision({ userId: ACTOR, email: null }, valid, d)).toEqual({ ok: true, workspaceId: WS, slug: "s", isExisting: true });
  });

  it("payload hash ignores the idempotency key but changes with the payload", async () => {
    const a = await inputHash({ ...valid, workspaceType: "customer" } as any);
    const b = await inputHash({ ...valid, workspaceType: "customer", idempotencyKey: "other_key_123456789" } as any);
    const c = await inputHash({ ...valid, workspaceType: "customer", workspaceName: "Other" } as any);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("legacy SSO containment and entitlement isolation", () => {
  it("only explicitly eligible workspaces are legacy SSO candidates", () => {
    expect(isLegacySsoCandidate({ ssoEligible: true })).toBe(true);
    expect(isLegacySsoCandidate({ ssoEligible: false })).toBe(false);
    expect(isLegacySsoCandidate({ ssoEligible: undefined as unknown as boolean })).toBe(false);
  });

  it("an entitlement covers only its exact linked workspace", () => {
    expect(entitlementCoversWorkspace({ workspace_id: WS }, WS)).toBe(true);
    expect(entitlementCoversWorkspace({ workspace_id: null }, WS)).toBe(false);
    expect(entitlementCoversWorkspace({ workspace_id: TARGET }, WS)).toBe(false);
    expect(entitlementCoversWorkspace(null, WS)).toBe(false);
  });
});
