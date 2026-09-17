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
  appPermissionKeys,
  filterPermissionsByLevel,
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

/** Every active workspace the user belongs to, workspaces they own first. */
export async function listActiveWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const { data } = await supabaseAdmin
    .from("workspace_memberships")
    .select("workspace_id, workspaces(id, name, slug, owner_user_id, status)")
    .eq("user_id", userId)
    .eq("status", "active");

  return (data ?? [])
    .map((r) => r.workspaces as unknown as WorkspaceSummaryRow | null)
    .filter((w): w is WorkspaceSummaryRow => Boolean(w) && w!.status === "active")
    .sort((a, b) => Number(b.owner_user_id === userId) - Number(a.owner_user_id === userId))
    .map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      ownerUserId: w.owner_user_id,
      status: w.status,
    }));
}

/**
 * Does this workspace currently hold access? The entitlement belongs to the
 * workspace owner — the same record billing writes. Nothing is duplicated.
 */
/**
 * The subscription record that covers THIS workspace, read from its owner.
 *
 * A record linked to another workspace never covers this one — otherwise the
 * empty personal workspace every account is provisioned with would silently
 * inherit the label's plan. A record with no workspace link still counts, so
 * subscriptions bought before workspaces existed keep working.
 */
export async function workspaceEntitlementRow(workspaceId: string) {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws?.owner_user_id) return null;
  const row = await refreshEntitlementStatus(ws.owner_user_id);
  if (!row) return null;
  if (row.workspace_id && row.workspace_id !== workspaceId) return null;
  return row;
}

export async function workspaceHasActiveEntitlement(workspaceId: string): Promise<boolean> {
  const row = await workspaceEntitlementRow(workspaceId);
  return row?.access_status === "active";
}

/**
 * The workspace whose entitlement backs this user, and the user that entitlement
 * belongs to. A team member is covered by the owner's plan — they never need an
 * entitlement of their own.
 */
export async function resolveBackingWorkspace(
  userId: string,
): Promise<{ workspaceId: string; ownerUserId: string } | null> {
  for (const ws of await listActiveWorkspaces(userId)) {
    if (await workspaceHasActiveEntitlement(ws.id)) {
      return { workspaceId: ws.id, ownerUserId: ws.ownerUserId };
    }
  }
  return null;
}

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
  const superAdmin = await isPlatformSuperAdmin(userId);
  const workspaces = await listActiveWorkspaces(userId);

  if (workspaces.length === 0) {
    // Legacy single-user account with no workspace yet: entitlement alone
    // decides, exactly as before, so nobody loses access during transition.
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

  let fallback: Awaited<ReturnType<typeof resolveAuthorizedApps>> | null = null;

  // A user can own an empty workspace and still be a member of the paying one,
  // so every active workspace is considered and the first that actually grants
  // applications wins.
  for (const workspace of workspaces) {
    const access = await resolveWorkspaceAccess(userId, workspace.id);
    const covered = superAdmin || (await workspaceHasActiveEntitlement(workspace.id));
    const entitled = covered ? await entitledApps(workspace.id) : [];

    const apps =
      access.membershipStatus !== "active"
        ? []
        : superAdmin || access.isOwner
          ? entitled
          : entitled.filter(
              (app) =>
                access.appAccess[app] !== "no_access" &&
                access.permissions.includes(`${app}.access`),
            );

    const resolved = {
      apps,
      workspaceId: workspace.id,
      roleKey: access.roleKey,
      isOwner: access.isOwner,
      isPlatformSuperAdmin: superAdmin,
    };
    if (apps.length > 0) return resolved;
    fallback ??= resolved;
  }

  return fallback!;
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

/* ------------------------------------------------ per-application decision */

export type AppAuthorizationReason =
  | null
  | "invalid_app"
  | "no_workspace"
  | "no_membership"
  | "workspace_inactive"
  | "membership_inactive"
  | "membership_suspended"
  | "membership_removed"
  | "no_entitlement"
  | "app_not_in_plan"
  | "no_access";

export type EntitlementSummary = {
  hasAccess: boolean;
  status: "none" | "active" | "expired";
  planId: string | null;
  expiryDate: string | null;
};

export type AppAuthorization = {
  authorized: boolean;
  userId: string;
  workspaceId: string | null;
  workspaceStatus: string | null;
  membershipId: string | null;
  appSlug: AppSlug | null;
  accessLevel: AppAccessLevel;
  membershipStatus: MembershipStatus | "none";
  roleKey: string | null;
  roleName: string | null;
  isOwner: boolean;
  isPlatformSuperAdmin: boolean;
  /** Effective permissions for THIS app: role permissions ∩ access level. */
  permissions: PermissionKey[];
  entitlement: EntitlementSummary;
  /** True only for accounts that were never provisioned into a workspace. */
  legacyNoWorkspace: boolean;
  evaluatedAt: string;
  /** Present only when `authorized` is false. */
  reason: AppAuthorizationReason;
};

/** Machine-readable denial code for child-app diagnostics. */
export function reasonCode(reason: AppAuthorizationReason): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    invalid_app: "APP_NOT_REGISTERED",
    no_workspace: "NO_WORKSPACE",
    no_membership: "NO_MEMBERSHIP",
    workspace_inactive: "WORKSPACE_INACTIVE",
    membership_inactive: "MEMBERSHIP_INACTIVE",
    membership_suspended: "MEMBERSHIP_SUSPENDED",
    membership_removed: "MEMBERSHIP_REMOVED",
    no_entitlement: "ENTITLEMENT_INACTIVE",
    app_not_in_plan: "APP_NOT_INCLUDED",
    no_access: "APP_ACCESS_DENIED",
  };
  return map[reason] ?? "DENIED";
}

type MembershipRecord = {
  membershipId: string;
  workspaceId: string;
  workspaceStatus: string;
  membershipStatus: MembershipStatus;
  roleKey: string | null;
  roleName: string | null;
};

/**
 * EVERY membership row for the user, regardless of membership or workspace
 * status. This is what proves an account has been provisioned into the workspace
 * architecture — and therefore must never fall back to "the plan is active".
 */
export async function listMembershipRecords(userId: string): Promise<MembershipRecord[]> {
  const { data } = await supabaseAdmin
    .from("workspace_memberships")
    .select(
      "id, workspace_id, status, workspace_roles(role_key, name), workspaces(status)",
    )
    .eq("user_id", userId);

  return (data ?? []).map((row) => {
    const role = row.workspace_roles as unknown as { role_key: string; name: string } | null;
    const ws = row.workspaces as unknown as { status: string } | null;
    return {
      membershipId: row.id,
      workspaceId: row.workspace_id,
      workspaceStatus: ws?.status ?? "unknown",
      membershipStatus: row.status as MembershipStatus,
      roleKey: role?.role_key ?? null,
      roleName: role?.name ?? null,
    };
  });
}

/** Entitlement facts for a workspace, read from the owner's single record. */
export async function workspaceEntitlementSummary(
  workspaceId: string,
): Promise<EntitlementSummary> {
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws?.owner_user_id) return { hasAccess: false, status: "none", planId: null, expiryDate: null };
  const row = await refreshEntitlementStatus(ws.owner_user_id);
  const status = (row?.access_status ?? "none") as EntitlementSummary["status"];
  return {
    hasAccess: status === "active",
    status,
    planId: row?.plan_id ?? null,
    expiryDate: row?.access_expiry_date ?? null,
  };
}

/**
 * THE single per-application authorization answer, for one user and one app.
 *
 * It adds no rules of its own: it calls `resolveAuthorizedApps` (entitlement ∩
 * membership ∩ member app access ∩ role permissions) for the decision and
 * `resolveWorkspaceAccess` for the level/role/status detail. Both the launch
 * route and the server-to-server endpoint go through here, so there is exactly
 * one implementation of the access model.
 *
 * `userId` MUST come from a verified session or a shared-key server call — never
 * from browser-supplied data.
 */
export async function resolveAppAuthorization(
  userId: string,
  appSlug: string,
): Promise<AppAuthorization> {
  const evaluatedAt = new Date().toISOString();
  const noEntitlement: EntitlementSummary = {
    hasAccess: false,
    status: "none",
    planId: null,
    expiryDate: null,
  };
  const base: AppAuthorization = {
    authorized: false,
    userId,
    workspaceId: null,
    workspaceStatus: null,
    membershipId: null,
    appSlug: null,
    accessLevel: "no_access",
    membershipStatus: "none",
    roleKey: null,
    roleName: null,
    isOwner: false,
    isPlatformSuperAdmin: false,
    permissions: [],
    entitlement: noEntitlement,
    legacyNoWorkspace: false,
    evaluatedAt,
    reason: "invalid_app",
  };

  if (!(APP_KEYS as string[]).includes(appSlug)) return base;
  const slug = appSlug as AppSlug;

  const superAdmin = await isPlatformSuperAdmin(userId);

  // Every membership row, whatever its status: this is what proves the account
  // has been provisioned into the workspace architecture.
  const records = await listMembershipRecords(userId);

  if (records.length === 0) {
    // Genuinely legacy: an account never provisioned into any workspace. Its own
    // active entitlement decides, exactly as the launcher behaved before
    // workspaces existed, so no untouched account loses access.
    const own = superAdmin
      ? true
      : (await refreshEntitlementStatus(userId))?.access_status === "active";
    const registry = (APP_KEYS as AppSlug[]).filter((k) => {
      const app = APPS.find((a) => a.key === k);
      return app?.enabled && app.includedInSubscription;
    });
    const permitted = own && registry.includes(slug);
    const level: AppAccessLevel = permitted ? "manage" : "no_access";
    return {
      ...base,
      appSlug: slug,
      isPlatformSuperAdmin: superAdmin,
      authorized: permitted,
      accessLevel: level,
      membershipStatus: "none",
      legacyNoWorkspace: true,
      permissions: permitted ? filterPermissionsByLevel(slug, level, appPermissionKeys(slug)) : [],
      entitlement: permitted
        ? { hasAccess: true, status: "active", planId: null, expiryDate: null }
        : noEntitlement,
      reason: permitted ? null : "no_workspace",
    };
  }

  // Provisioned account: every workspace it belongs to is evaluated, the first
  // that authorizes wins, and otherwise the most meaningful denial is reported.
  // A member commonly also owns an empty personal workspace, which must never
  // mask the real reason coming from the workspace that holds the subscription.
  let best: AppAuthorization | null = null;
  for (const record of records) {
    const candidate = await evaluateWorkspaceApp(userId, record, slug, superAdmin, evaluatedAt);
    if (candidate.authorized) return candidate;
    if (!best || denialRank(candidate.reason) < denialRank(best.reason)) best = candidate;
  }
  return best ?? { ...base, appSlug: slug, reason: "no_membership" };
}

/** Lower is reported first: the denial closest to the real cause. */
function denialRank(reason: AppAuthorizationReason): number {
  const order: AppAuthorizationReason[] = [
    "no_access",
    "app_not_in_plan",
    "membership_suspended",
    "membership_removed",
    "workspace_inactive",
    "membership_inactive",
    "no_entitlement",
    "no_membership",
    "no_workspace",
  ];
  const index = order.indexOf(reason);
  return index === -1 ? order.length : index;
}

/** The decision for ONE workspace. Adds no rules: it reads the resolvers. */
async function evaluateWorkspaceApp(
  userId: string,
  record: MembershipRecord,
  slug: AppSlug,
  superAdmin: boolean,
  evaluatedAt: string,
): Promise<AppAuthorization> {
  const access = await resolveWorkspaceAccess(userId, record.workspaceId);
  const entitlement = await workspaceEntitlementSummary(record.workspaceId);
  const level: AppAccessLevel =
    access.isOwner || superAdmin ? "manage" : (access.appAccess[slug] ?? "no_access");

  const detailed: AppAuthorization = {
    authorized: false,
    userId,
    workspaceId: record.workspaceId,
    workspaceStatus: access.workspace?.status ?? record.workspaceStatus,
    membershipId: access.membership?.id ?? record.membershipId,
    appSlug: slug,
    accessLevel: level,
    membershipStatus: access.membershipStatus,
    roleKey: access.roleKey ?? record.roleKey,
    roleName: access.membership?.roleName ?? record.roleName,
    isOwner: access.isOwner,
    isPlatformSuperAdmin: superAdmin,
    permissions: [],
    entitlement,
    legacyNoWorkspace: false,
    evaluatedAt,
    reason: null,
  };

  // The workspace itself must be active. A suspended or archived workspace fails
  // closed even when the subscription is still paid.
  if ((access.workspace?.status ?? record.workspaceStatus) !== "active") {
    return { ...detailed, accessLevel: "no_access", reason: "workspace_inactive" };
  }

  if (access.membershipStatus !== "active") {
    const reason: AppAuthorizationReason =
      access.membershipStatus === "suspended"
        ? "membership_suspended"
        : access.membershipStatus === "removed"
          ? "membership_removed"
          : access.membershipStatus === "none"
            ? "no_membership"
            : "membership_inactive";
    return { ...detailed, accessLevel: "no_access", reason };
  }

  if (!(superAdmin || entitlement.hasAccess)) {
    return { ...detailed, accessLevel: "no_access", reason: "no_entitlement" };
  }

  const entitled = await entitledApps(record.workspaceId);
  if (!entitled.includes(slug)) {
    return { ...detailed, accessLevel: "no_access", reason: "app_not_in_plan" };
  }

  if (level === "no_access") {
    return { ...detailed, accessLevel: "no_access", reason: "no_access" };
  }

  // Effective permissions come from the ONE permission resolver
  // (`resolveWorkspaceAccess`), narrowed by the member's access level.
  // Owner and platform super admin hold the app's full permission set.
  const rolePermissions =
    access.isOwner || superAdmin
      ? appPermissionKeys(slug)
      : access.permissions.filter((p) => p.startsWith(`${slug}.`));
  const permissions = filterPermissionsByLevel(slug, level, rolePermissions);

  // `<app>.access` is the entry permission: without it there is no authorization.
  if (!permissions.includes(`${slug}.access`)) {
    return { ...detailed, accessLevel: "no_access", reason: "no_access" };
  }

  return { ...detailed, authorized: true, permissions, reason: null };
}
