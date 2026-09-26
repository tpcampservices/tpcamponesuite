import { beforeEach, describe, expect, it, vi } from "vitest";

// Fictional test-only data. No real workspaces or users.
const WS_TEST = "aaaaaaaa-1111-4111-8111-111111111111";
const WS_OTHER = "bbbbbbbb-2222-4222-8222-222222222222";
const ADMIN = "cccccccc-3333-4333-8333-333333333333";
const STAFF = "dddddddd-4444-4444-8444-444444444444";

const WORKSPACES: Record<string, { id: string; name: string; slug: string; owner_user_id: string; status: string }> = {
  [WS_TEST]: { id: WS_TEST, name: "Fictional Test Workspace", slug: "t", owner_user_id: "x", status: "active" },
  [WS_OTHER]: { id: WS_OTHER, name: "Fictional Other Workspace", slug: "o", owner_user_id: "y", status: "active" },
};
const queriedIds: string[] = [];
const selectedColumns: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "workspaces") throw new Error("unexpected table " + table);
      let id = "";
      const q = {
        select: (cols: string) => (selectedColumns.push(cols), q),
        eq: (_c: string, v: string) => ((id = v), queriedIds.push(v), q),
        maybeSingle: async () => {
          const w = WORKSPACES[id];
          return { data: w ? { id: w.id, name: w.name } : null, error: null };
        },
      };
      return q;
    },
  },
}));

const base = {
  authorized: true,
  workspaceStatus: "active",
  membershipStatus: "active",
  isPlatformSuperAdmin: false,
  entitlement: { hasAccess: true, status: "active", planId: "growth", expiryDate: "2026-10-17" },
  legacyNoWorkspace: false,
  evaluatedAt: "2026-09-26T00:00:00.000Z",
  reason: null,
};
const RESOLVED: Record<string, unknown> = {
  [ADMIN]: {
    ...base, userId: ADMIN, workspaceId: WS_TEST, membershipId: "m1", appSlug: "catalog",
    accessLevel: "manage", roleKey: "administrator", roleName: "Administrator", isOwner: false,
    permissions: ["catalog.view", "catalog.edit", "catalog.manage"],
  },
  [STAFF]: {
    ...base, userId: STAFF, workspaceId: WS_OTHER, membershipId: "m2", appSlug: "catalog",
    accessLevel: "edit", roleKey: "staff", roleName: "Staff", isOwner: false,
    permissions: ["catalog.view", "catalog.edit"],
  },
};

vi.mock("./workspace.server", () => ({
  resolveAppAuthorization: vi.fn(async (userId: string) =>
    RESOLVED[userId] ?? {
      ...base, authorized: false, userId, workspaceId: null, workspaceStatus: null, membershipId: null,
      appSlug: "catalog", accessLevel: "no_access", membershipStatus: "none", roleKey: null,
      roleName: null, isOwner: false, permissions: [], reason: "no_membership",
      entitlement: { hasAccess: false, status: "none", planId: null, expiryDate: null },
    },
  ),
  reasonCode: (r: string | null) => (r ? "NO_MEMBERSHIP" : null),
}));

const { authorizationFor, workspaceNameFor } = await import("./sso.server");

beforeEach(() => {
  queriedIds.length = 0;
  selectedColumns.length = 0;
});

describe("authorization response workspace_name", () => {
  it("returns the resolved workspace's name, matching workspace_id", async () => {
    const r = await authorizationFor(ADMIN, "catalog");
    expect(r.workspace_id).toBe(WS_TEST);
    expect(r.workspace_name).toBe("Fictional Test Workspace");
    expect(queriedIds).toEqual([WS_TEST]);
  });

  it("only reads the name column (no extra workspace metadata)", async () => {
    await authorizationFor(ADMIN, "catalog");
    expect(selectedColumns).toEqual(["id, name"]);
    const r = await authorizationFor(ADMIN, "catalog");
    expect(Object.keys(r)).not.toContain("workspace_slug");
    expect(Object.keys(r)).not.toContain("workspace_owner");
  });

  it("caller cannot choose the workspace: signature takes no workspace input", async () => {
    // Extra args (as a browser/caller might try) are ignored by construction.
    const r = await (authorizationFor as (...a: unknown[]) => Promise<{ workspace_name: string | null; workspace_id: string | null }>)(
      ADMIN, "catalog", WS_OTHER,
    );
    expect(r.workspace_id).toBe(WS_TEST);
    expect(r.workspace_name).toBe("Fictional Test Workspace");
    expect(queriedIds).not.toContain(WS_OTHER);
  });

  it("isolation: each user only receives their own resolved workspace name", async () => {
    const a = await authorizationFor(ADMIN, "catalog");
    const s = await authorizationFor(STAFF, "catalog");
    expect(a.workspace_name).toBe("Fictional Test Workspace");
    expect(s.workspace_name).toBe("Fictional Other Workspace");
  });

  it("no resolved workspace → null name and no lookup", async () => {
    const r = await authorizationFor("eeeeeeee-5555-4555-8555-555555555555", "catalog");
    expect(r.authorized).toBe(false);
    expect(r.workspace_id).toBeNull();
    expect(r.workspace_name).toBeNull();
    expect(queriedIds).toEqual([]);
    expect(await workspaceNameFor(null)).toBeNull();
  });

  it("administrator QA shape: Catalog Manage unchanged", async () => {
    const r = await authorizationFor(ADMIN, "catalog");
    expect(r.app_access).toBe("manage");
    expect(r.role_key).toBe("administrator");
    expect(r.permissions).toEqual(["catalog.view", "catalog.edit", "catalog.manage"]);
  });

  it("Staff authorization unchanged", async () => {
    const r = await authorizationFor(STAFF, "catalog");
    expect(r.app_access).toBe("edit");
    expect(r.role_key).toBe("staff");
    expect(r.permissions).toEqual(["catalog.view", "catalog.edit"]);
    expect(r.permissions).not.toContain("catalog.manage");
  });

  it("backward compatible: all previous fields still present, version unchanged", async () => {
    const r = await authorizationFor(ADMIN, "catalog");
    for (const k of [
      "authorized", "user_id", "workspace_id", "workspace_status", "membership_id", "app_slug",
      "app_access", "membership_status", "role_key", "role_name", "permissions", "entitlement",
      "is_owner", "is_super_admin", "legacy_no_workspace", "authorization_version",
      "evaluated_at", "checked_at", "reason", "reason_code",
    ]) expect(r).toHaveProperty(k);
    expect(r.authorization_version).toBe(2);
    const { workspace_name: _n, ...legacy } = r;
    expect(Object.keys(legacy)).not.toContain("workspace_name");
  });
});
