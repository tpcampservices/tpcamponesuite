/**
 * Server-only central authorization layer for workspaces.
 *
 * ONE resolver decides workspace authorization; pages and server functions must
 * never re-derive it. The caller's user id always comes from a verified session —
 * ids supplied by the browser are never trusted as authorization facts.
 *
 * This phase is additive: nothing here removes or overrides existing entitlement,
 * SSO, super-admin or child-app behaviour.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { refreshEntitlementStatus } from "./access.server";
import { getPlan } from "./plans";
import { APP_KEYS, APPS, type AppSlug } from "./apps";
import {
  permissionsForRole,
  type AppAccessLevel,
  type MembershipStatus,
  type PermissionKey,
} from "./permissions";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string | null;
  ownerUserId: string;
  status: string;
};

export type WorkspaceMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  status: MembershipStatus;
  roleKey: string;
  roleName: string;
  isSystemRole: boolean;
  joinedAt: string | null;
};

export type WorkspaceAccess = {
  workspace: WorkspaceSummary | null;
  membership: WorkspaceMembership | null;
  membershipStatus: MembershipStatus | "none";
  roleKey: string | null;
  isOwner: boolean;
  /** Per-app access level; apps with no row resolve to `no_access`. */
  appAccess: Record<AppSlug, AppAccessLevel>;
  permissions: PermissionKey[];
  /** Platform staff role — deliberately separate from workspace roles. */
  isPlatformSuperAdmin: boolean;
};

const EMPTY_APP_ACCESS = () =>
  Object.fromEntries((APP_KEYS as AppSlug[]).map((k) => [k, "no_access"])) as Record<
    AppSlug,
    AppAccessLevel
  >;

export function emptyWorkspaceAccess(isPlatformSuperAdmin = false): WorkspaceAccess {
  return {
    workspace: null,
    membership: null,
    membershipStatus: "none",
    roleKey: null,
    isOwner: false,
    appAccess: EMPTY_APP_ACCESS(),
    permissions: [],
    isPlatformSuperAdmin,
  };
}

async function isPlatformSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return Boolean(data);
}

/**
 * The single authoritative workspace authorization resolution.
 * `userId` MUST come from a verified server-side session.
 */
export async function resolveWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccess> {
  const superAdmin = await isPlatformSuperAdmin(userId);
  const base = emptyWorkspaceAccess(superAdmin);

  const { data: membership } = await supabaseAdmin
    .from("workspace_memberships")
    .select(
      "id, workspace_id, user_id, status, joined_at, role_id, workspace_roles(role_key, name, is_system), workspaces(id, name, slug, owner_user_id, status)",
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return base;

  const role = membership.workspace_roles as unknown as {
    role_key: string;
    name: string;
    is_system: boolean;
  } | null;
  const ws = membership.workspaces as unknown as {
    id: string;
    name: string;
    slug: string | null;
    owner_user_id: string;
    status: string;
  } | null;

  const status = membership.status as MembershipStatus;
  const resolved: WorkspaceAccess = {
    ...base,
    workspace: ws
      ? {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          ownerUserId: ws.owner_user_id,
          status: ws.status,
        }
      : null,
    membership: {
      id: membership.id,
      workspaceId: membership.workspace_id,
      userId: membership.user_id,
      status,
      roleKey: role?.role_key ?? "",
      roleName: role?.name ?? "",
      isSystemRole: role?.is_system ?? false,
      joinedAt: membership.joined_at,
    },
    membershipStatus: status,
    roleKey: role?.role_key ?? null,
    isOwner: role?.role_key === "owner",
  };

  // Only an active membership carries authority.
  if (status !== "active") return resolved;

  const { data: appRows } = await supabaseAdmin
    .from("workspace_member_app_access")
    .select("app_key, access_level")
    .eq("membership_id", membership.id);

  const appAccess = EMPTY_APP_ACCESS();
  for (const row of appRows ?? []) {
    if ((APP_KEYS as string[]).includes(row.app_key)) {
      appAccess[row.app_key as AppSlug] = row.access_level as AppAccessLevel;
    }
  }
  // The Owner always retains full access to every app in the registry.
  if (resolved.isOwner) for (const key of APP_KEYS as AppSlug[]) appAccess[key] = "manage";

  // Role permissions come from the stored mapping, with the code catalogue as the
  // fallback so a freshly seeded environment behaves identically.
  let permissions: PermissionKey[] = [];
  const { data: rolePerms } = await supabaseAdmin
    .from("workspace_role_permissions")
    .select("workspace_permissions(permission_key)")
    .eq("role_id", membership.role_id);
  permissions = (rolePerms ?? [])
    .map((r) => (r.workspace_permissions as unknown as { permission_key: string } | null))
    .filter((p): p is { permission_key: string } => Boolean(p))
    .map((p) => p.permission_key);
  if (permissions.length === 0 && role?.role_key) {
    permissions = permissionsForRole(role.role_key);
  }

  // Per-member app access narrows the role: a member with no access to an app
  // holds none of that app's permissions. (Override/group hooks land in Step 4+.)
  const filtered = permissions.filter((key) => {
    const app = key.split(".")[0] as AppSlug;
    if (!(APP_KEYS as string[]).includes(app)) return true;
    return appAccess[app] !== "no_access";
  });

  return { ...resolved, appAccess, permissions: filtered };
}

export async function hasWorkspacePermission(
  userId: string,
  workspaceId: string,
  permissionKey: PermissionKey,
): Promise<boolean> {
  const access = await resolveWorkspaceAccess(userId, workspaceId);
  if (access.membershipStatus !== "active") return false;
  if (access.isOwner) return true;
  return access.permissions.includes(permissionKey);
}

/**
 * The user's current workspace. Multi-workspace ready: it picks the caller's
 * active memberships, prefers a workspace they own, and validates membership
 * server-side. Never derived from browser storage.
 */
export async function resolveCurrentWorkspace(
  userId: string,
  preferredWorkspaceId?: string | null,
): Promise<WorkspaceSummary | null> {
  const { data } = await supabaseAdmin
    .from("workspace_memberships")
    .select("workspace_id, workspaces(id, name, slug, owner_user_id, status)")
    .eq("user_id", userId)
    .eq("status", "active");

  const rows = (data ?? [])
    .map((r) => r.workspaces as unknown as WorkspaceSummaryRow | null)
    .filter((w): w is WorkspaceSummaryRow => Boolean(w) && w!.status === "active");

  if (rows.length === 0) return null;

  const chosen =
    (preferredWorkspaceId ? rows.find((w) => w.id === preferredWorkspaceId) : undefined) ??
    rows.find((w) => w.owner_user_id === userId) ??
    rows[0]!;

  return {
    id: chosen.id,
    name: chosen.name,
    slug: chosen.slug,
    ownerUserId: chosen.owner_user_id,
    status: chosen.status,
  };
}

type WorkspaceSummaryRow = {
  id: string;
  name: string;
  slug: string | null;
  owner_user_id: string;
  status: string;
};

export type SeatAccounting = {
  workspaceId: string;
  planId: string | null;
  includedSeats: number;
  extraSeats: number;
  totalSeats: number;
  usedSeats: number;
  /** Valid pending invitations — each one holds a seat until it lapses. */
  pendingInvitations: number;
  /** active memberships + valid pending invitations */
  reservedSeats: number;
  availableSeats: number;
};

/**
 * The workspace a user owns, provisioning it if it somehow does not exist yet.
 * Always server-resolved from a verified user id — never from the browser.
 */
export async function ensureUserWorkspaceId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("provision_user_workspace", {
    _user_id: userId,
  });
  if (error) {
    console.error("provision_user_workspace failed", error.message);
    const existing = await resolveCurrentWorkspace(userId);
    return existing?.id ?? null;
  }
  return (data as string | null) ?? null;
}

/**
 * Seat accounting reads the SAME entitlement record billing writes:
 * `seats_limit` (explicit override) or the plan's included seats, plus
 * `seats_extra` from purchased Team Add seats. No second seat calculation exists,
 * and nothing here writes to billing.
 */
export async function getSeatAccounting(workspaceId: string): Promise<SeatAccounting> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();

  const entitlement = ws?.owner_user_id
    ? await refreshEntitlementStatus(ws.owner_user_id)
    : null;

  const plan = getPlan(entitlement?.plan_id ?? null);
  const includedSeats =
    entitlement?.seats_limit ?? plan?.features.includedSeats ?? plan?.limits.seats ?? 0;
  const extraSeats = entitlement?.seats_extra ?? 0;
  const totalSeats = includedSeats + extraSeats;

  // Active memberships only — suspended and removed members free their seat.
  const [{ count }, { count: pendingCount }] = await Promise.all([
    supabaseAdmin
      .from("workspace_memberships")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    // A pending invitation reserves a seat; cancelled, accepted and lapsed
    // invitations release it (expiry is evaluated live, not by a background job).
    supabaseAdmin
      .from("workspace_invitations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const usedSeats = count ?? 0;
  const pendingInvitations = pendingCount ?? 0;
  const reservedSeats = usedSeats + pendingInvitations;

  return {
    workspaceId,
    planId: entitlement?.plan_id ?? null,
    includedSeats,
    extraSeats,
    totalSeats,
    usedSeats,
    pendingInvitations,
    reservedSeats,
    availableSeats: Math.max(0, totalSeats - reservedSeats),
  };
}

/** Seat guard for the invitation workflow. Read-only, never billing. */
export async function workspaceHasAvailableSeat(workspaceId: string): Promise<{
  ok: boolean;
  seats: SeatAccounting;
}> {
  const seats = await getSeatAccounting(workspaceId);
  return { ok: seats.availableSeats > 0, seats };
}

/**
 * THE authoritative per-user application decision:
 *   workspace entitlement ∩ member app access ∩ role permissions
 *
 * The Owner keeps the deliberate automatic manage fallback, and platform
 * super admins keep full access. Every launch and every dashboard tile must
 * come through here rather than reading "the plan is active" alone.
 */
export async function resolveAuthorizedApps(userId: string): Promise<{
  apps: AppSlug[];
  workspaceId: string | null;
  roleKey: string | null;
  isOwner: boolean;
  isPlatformSuperAdmin: boolean;
}> {
  const workspace = await resolveCurrentWorkspace(userId);

  if (!workspace) {
    // Legacy single-user account with no workspace yet: entitlement alone
    // decides, exactly as before, so nobody loses access during transition.
    const superAdmin = await isPlatformSuperAdmin(userId);
    const registry = (APP_KEYS as AppSlug[]).filter((k) => {
      const app = APPS.find((a) => a.key === k);
      return app?.enabled && app.includedInSubscription;
    });
    return {
      apps: registry,
      workspaceId: null,
      roleKey: null,
      isOwner: false,
      isPlatformSuperAdmin: superAdmin,
    };
  }

  const [access, entitled] = await Promise.all([
    resolveWorkspaceAccess(userId, workspace.id),
    entitledApps(workspace.id),
  ]);

  if (access.isPlatformSuperAdmin) {
    return {
      apps: entitled,
      workspaceId: workspace.id,
      roleKey: access.roleKey,
      isOwner: access.isOwner,
      isPlatformSuperAdmin: true,
    };
  }

  if (access.membershipStatus !== "active") {
    return {
      apps: [],
      workspaceId: workspace.id,
      roleKey: access.roleKey,
      isOwner: access.isOwner,
      isPlatformSuperAdmin: false,
    };
  }

  const apps = access.isOwner
    ? entitled
    : entitled.filter(
        (app) =>
          access.appAccess[app] !== "no_access" && access.permissions.includes(`${app}.access`),
      );

  return {
    apps,
    workspaceId: workspace.id,
    roleKey: access.roleKey,
    isOwner: access.isOwner,
    isPlatformSuperAdmin: false,
  };
}

/** Apps the workspace subscription actually includes. */
export async function entitledApps(workspaceId: string): Promise<AppSlug[]> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const entitlement = ws?.owner_user_id ? await refreshEntitlementStatus(ws.owner_user_id) : null;
  const allowed = entitlement?.allowed_apps;
  const registry = (APP_KEYS as AppSlug[]).filter((k) => {
    const app = APPS.find((a) => a.key === k);
    return app?.enabled && app.includedInSubscription;
  });
  if (Array.isArray(allowed) && allowed.length) {
    return registry.filter((k) => allowed.includes(k));
  }
  return registry;
}
