/**
 * Server-only management of EXISTING workspace memberships.
 *
 * Nothing here introduces a second team, role, permission or access system: it
 * reads and writes the existing `workspace_memberships`,
 * `workspace_member_app_access`, `workspace_roles` and `team_audit_log` tables,
 * and every authority decision comes from `resolveWorkspaceAccess`.
 *
 * The governing rule is unchanged:
 *   effective access = workspace entitlement ∩ member app access ∩ role permissions
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  entitledApps,
  getSeatAccounting,
  resolveWorkspaceAccess,
  workspaceHasAvailableSeat,
} from "./workspace.server";
import {
  isAppAccessLevel,
  isMembershipStatus,
  type AppAccessLevel,
  type MembershipStatus,
} from "./permissions";
import { isAppSlug, type AppSlug } from "./apps";
import { INVITABLE_ROLE_KEYS, isInvitableRole } from "./invitations.server";

export type TeamMember = {
  membershipId: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  roleKey: string;
  roleName: string;
  status: MembershipStatus;
  joinedAt: string | null;
  isOwner: boolean;
  /** Level per app, limited to the workspace's entitled apps. */
  appAccess: Record<string, AppAccessLevel>;
};

/** Team administration authority. Owner always qualifies. */
async function assertMayManage(userId: string, workspaceId: string, permission: string) {
  const access = await resolveWorkspaceAccess(userId, workspaceId);
  if (access.membershipStatus !== "active") {
    throw new Error("You are not an active member of this workspace");
  }
  if (!access.isOwner && !access.permissions.includes(permission)) {
    throw new Error("You do not have permission to manage team members");
  }
  return access;
}

/** The target must belong to the SAME workspace as the actor. */
async function loadTarget(workspaceId: string, membershipId: string) {
  const { data } = await supabaseAdmin
    .from("workspace_memberships")
    .select("id, workspace_id, user_id, status, role_id, workspace_roles(role_key, name)")
    .eq("id", membershipId)
    .maybeSingle();
  if (!data || data.workspace_id !== workspaceId) {
    throw new Error("That team member was not found in your workspace");
  }
  const role = data.workspace_roles as unknown as { role_key: string; name: string } | null;
  return { ...data, roleKey: role?.role_key ?? "", roleName: role?.name ?? "" };
}

async function activeOwnerCount(workspaceId: string) {
  const { data } = await supabaseAdmin
    .from("workspace_memberships")
    .select("id, workspace_roles!inner(role_key)")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("workspace_roles.role_key", "owner");
  return (data ?? []).length;
}

/**
 * The workspace must never be left without an active Owner, and only the Owner
 * may act on another Owner.
 */
async function assertOwnerSafety(args: {
  workspaceId: string;
  actorIsOwner: boolean;
  targetRoleKey: string;
  /** True when the change would stop the target being an active Owner. */
  removesOwner: boolean;
}) {
  if (args.targetRoleKey === "owner" && !args.actorIsOwner) {
    throw new Error("Only the workspace owner can change the owner's access");
  }
  if (args.removesOwner && args.targetRoleKey === "owner") {
    if ((await activeOwnerCount(args.workspaceId)) <= 1) {
      throw new Error("The workspace must keep at least one active owner");
    }
  }
}

async function audit(entry: {
  workspaceId: string;
  actorUserId: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  action: string;
  roleKey?: string | null;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("team_audit_log").insert({
    workspace_id: entry.workspaceId,
    actor_user_id: entry.actorUserId,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    action: entry.action,
    role_key: entry.roleKey ?? null,
    details: (entry.details ?? {}) as never,
  });
}

/** Members of the workspace, with their per-app access. */
export async function listMembers(
  actorUserId: string,
  workspaceId: string,
): Promise<TeamMember[]> {
  const access = await resolveWorkspaceAccess(actorUserId, workspaceId);
  if (access.membershipStatus !== "active") return [];
  const mayView =
    access.isOwner ||
    access.permissions.includes("workspace.team.view") ||
    access.permissions.includes("workspace.team.invite") ||
    access.permissions.includes("workspace.team.manage");
  if (!mayView) return [];

  const [{ data: rows }, entitled] = await Promise.all([
    supabaseAdmin
      .from("workspace_memberships")
      .select("id, user_id, status, joined_at, workspace_roles(role_key, name)")
      .eq("workspace_id", workspaceId)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    entitledApps(workspaceId),
  ]);

  const memberships = rows ?? [];
  const userIds = memberships.map((m) => m.user_id);
  const membershipIds = memberships.map((m) => m.id);

  const [{ data: profiles }, { data: appRows }] = await Promise.all([
    userIds.length
      ? supabaseAdmin.from("profiles").select("id, email, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    membershipIds.length
      ? supabaseAdmin
          .from("workspace_member_app_access")
          .select("membership_id, app_key, access_level")
          .in("membership_id", membershipIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return memberships.map((m) => {
    const role = m.workspace_roles as unknown as { role_key: string; name: string } | null;
    const isOwner = role?.role_key === "owner";
    const stored = (appRows ?? []).filter((r: any) => r.membership_id === m.id);
    const appAccess = Object.fromEntries(
      entitled.map((app) => {
        if (isOwner) return [app, "manage" as AppAccessLevel];
        const row = stored.find((r: any) => r.app_key === app);
        return [app, (row?.access_level ?? "no_access") as AppAccessLevel];
      }),
    ) as Record<string, AppAccessLevel>;
    const profile = profileById.get(m.user_id) as any;
    return {
      membershipId: m.id,
      userId: m.user_id,
      email: profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      roleKey: role?.role_key ?? "",
      roleName: role?.name ?? "",
      status: m.status as MembershipStatus,
      joinedAt: m.joined_at,
      isOwner,
      appAccess,
    };
  });
}

/** Change an existing member's role. Owner is never assignable here. */
export async function changeMemberRole(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  roleKey: string;
}) {
  const access = await assertMayManage(args.actorUserId, args.workspaceId, "workspace.roles.assign");
  if (!isInvitableRole(args.roleKey)) {
    throw new Error(`Choose one of: ${INVITABLE_ROLE_KEYS.join(", ")}`);
  }
  const target = await loadTarget(args.workspaceId, args.membershipId);
  await assertOwnerSafety({
    workspaceId: args.workspaceId,
    actorIsOwner: access.isOwner,
    targetRoleKey: target.roleKey,
    removesOwner: true,
  });
  if (target.roleKey === args.roleKey) return { ok: true as const, unchanged: true };

  const { data: role } = await supabaseAdmin
    .from("workspace_roles")
    .select("id")
    .is("workspace_id", null)
    .eq("role_key", args.roleKey)
    .maybeSingle();
  if (!role) throw new Error("That workspace role is not available");

  const { error } = await supabaseAdmin
    .from("workspace_memberships")
    .update({ role_id: role.id })
    .eq("id", target.id)
    .eq("workspace_id", args.workspaceId);
  if (error) throw new Error(error.message);

  await audit({
    workspaceId: args.workspaceId,
    actorUserId: args.actorUserId,
    targetUserId: target.user_id,
    action: "member_role_changed",
    roleKey: args.roleKey,
    details: { membership_id: target.id, previous_role: target.roleKey, new_role: args.roleKey },
  });
  return { ok: true as const, unchanged: false };
}

/** Set one application's access level for an existing member. */
export async function setMemberAppAccess(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  appKey: string;
  level: string;
}) {
  const access = await assertMayManage(args.actorUserId, args.workspaceId, "workspace.team.manage");
  if (!isAppSlug(args.appKey)) throw new Error("Unknown application");
  if (!isAppAccessLevel(args.level)) throw new Error("Choose a valid access level");

  const entitled = await entitledApps(args.workspaceId);
  if (!entitled.includes(args.appKey as AppSlug)) {
    throw new Error("Your plan does not include that application");
  }

  const target = await loadTarget(args.workspaceId, args.membershipId);
  if (target.roleKey === "owner") {
    throw new Error("The owner always keeps full access to every included application");
  }
  await assertOwnerSafety({
    workspaceId: args.workspaceId,
    actorIsOwner: access.isOwner,
    targetRoleKey: target.roleKey,
    removesOwner: false,
  });

  const { data: existing } = await supabaseAdmin
    .from("workspace_member_app_access")
    .select("access_level")
    .eq("membership_id", target.id)
    .eq("app_key", args.appKey)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("workspace_member_app_access")
    .upsert(
      { membership_id: target.id, app_key: args.appKey, access_level: args.level },
      { onConflict: "membership_id,app_key" },
    );
  if (error) throw new Error(error.message);

  await audit({
    workspaceId: args.workspaceId,
    actorUserId: args.actorUserId,
    targetUserId: target.user_id,
    action: "member_app_access_changed",
    roleKey: target.roleKey,
    details: {
      membership_id: target.id,
      app_key: args.appKey,
      previous_level: existing?.access_level ?? "no_access",
      new_level: args.level,
    },
  });
  return { ok: true as const };
}

/** Suspend, reactivate or remove an existing member. History is preserved. */
export async function setMemberStatus(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  status: string;
}) {
  const access = await assertMayManage(args.actorUserId, args.workspaceId, "workspace.team.manage");
  if (!isMembershipStatus(args.status)) throw new Error("Choose a valid member status");
  const target = await loadTarget(args.workspaceId, args.membershipId);

  if (target.user_id === args.actorUserId && args.status !== "active") {
    throw new Error("You cannot suspend or remove your own membership");
  }
  await assertOwnerSafety({
    workspaceId: args.workspaceId,
    actorIsOwner: access.isOwner,
    targetRoleKey: target.roleKey,
    removesOwner: args.status !== "active",
  });

  // Re-activating consumes a seat again — the same single seat calculation.
  if (args.status === "active" && target.status !== "active") {
    const { ok } = await workspaceHasAvailableSeat(args.workspaceId);
    if (!ok) throw new Error("All seats on your plan are in use or reserved");
  }

  const { error } = await supabaseAdmin
    .from("workspace_memberships")
    .update({ status: args.status })
    .eq("id", target.id)
    .eq("workspace_id", args.workspaceId);
  if (error) throw new Error(error.message);

  const action =
    args.status === "suspended"
      ? "member_suspended"
      : args.status === "removed"
        ? "member_removed"
        : "member_reactivated";

  await audit({
    workspaceId: args.workspaceId,
    actorUserId: args.actorUserId,
    targetUserId: target.user_id,
    action,
    roleKey: target.roleKey,
    details: {
      membership_id: target.id,
      previous_status: target.status,
      new_status: args.status,
    },
  });

  return { ok: true as const, seats: await getSeatAccounting(args.workspaceId) };
}

/* ------------------------------------- member-specific permission overrides */

/**
 * Advanced permissions: a single member's deviation from their role baseline,
 * stored in `workspace_member_permission_overrides`.
 *
 * This is a WRITE layer only — the authorization model is unchanged and still
 * resolved centrally (role baseline → member overrides → app-access cap → the
 * existing status/entitlement gates). Nothing here grants access by itself.
 *
 * The browser only ever names a membership inside the actor's own workspace and
 * a permission key; the workspace, the target's role, the canonical permission
 * and the actor's authority are all resolved server-side.
 */

/** Permissions that must never be removed from a member by an override. */
const NON_DENIABLE_PERMISSIONS = ["workspace.team.view"];

type OverrideEffect = "allow" | "deny";

/** Security-relevant rejection: observable server-side, opaque to the caller. */
function rejectOverride(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  permissionKey: string;
  effect: string;
  cause: string;
  message: string;
}): never {
  console.warn(
    "[member-permission-override] rejected",
    JSON.stringify({
      cause: args.cause,
      actor_user_id: args.actorUserId,
      workspace_id: args.workspaceId,
      membership_id: args.membershipId,
      permission_key: args.permissionKey,
      effect: args.effect,
      at: new Date().toISOString(),
    }),
  );
  throw new Error(args.message);
}

/** The canonical catalogue row for a permission key. Never trusts a client app. */
async function loadPermission(permissionKey: string) {
  const { data } = await supabaseAdmin
    .from("workspace_permissions")
    .select("id, permission_key, app_key")
    .eq("permission_key", permissionKey)
    .maybeSingle();
  return data ?? null;
}

async function targetIsPlatformSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return Boolean(data);
}

/**
 * Shared guard for every override mutation. Order is deliberate: authority →
 * target resolution → same-workspace → self-target → Owner → super admin →
 * canonical permission → entitlement.
 */
async function authorizeOverrideMutation(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  permissionKey: string;
  effect: OverrideEffect | "clear";
}) {
  const reject = (cause: string, message: string) =>
    rejectOverride({ ...args, cause, message });

  // Effective permission, never role name: an Administrator whose
  // `workspace.permissions.manage` has been denied fails here.
  const access = await resolveWorkspaceAccess(args.actorUserId, args.workspaceId);
  if (access.membershipStatus !== "active") {
    reject("actor_not_active", "You are not an active member of this workspace");
  }
  if (!access.isOwner && !access.permissions.includes("workspace.permissions.manage")) {
    reject("actor_not_authorized", "You do not have permission to manage advanced permissions");
  }

  const target = await loadTarget(args.workspaceId, args.membershipId);

  // Conservative in this phase: no self-targeted override at all, Allow or Deny.
  if (target.user_id === args.actorUserId) {
    reject(
      "self_target",
      "You cannot change your own advanced permissions — ask another owner or administrator",
    );
  }
  if (target.roleKey === "owner") {
    reject("owner_target", "The workspace owner's permissions cannot be overridden");
  }
  if (await targetIsPlatformSuperAdmin(target.user_id)) {
    // Deliberately does not disclose the platform role.
    reject("super_admin_target", "That member's permissions cannot be overridden");
  }

  const permission = await loadPermission(args.permissionKey);
  if (!permission) reject("unknown_permission", "Unknown permission");

  const appKey = permission!.app_key;
  const isAppPermission = isAppSlug(appKey);

  // An Allow must never become a way of pre-granting an app the plan excludes.
  // A Deny stays valid whatever the plan does, so it is not entitlement-gated.
  if (args.effect === "allow" && isAppPermission) {
    const entitled = await entitledApps(args.workspaceId);
    if (!entitled.includes(appKey as AppSlug)) {
      reject("app_not_entitled", "Your plan does not include that application");
    }
  }
  if (args.effect === "deny" && NON_DENIABLE_PERMISSIONS.includes(permission!.permission_key)) {
    reject("non_deniable", "That permission cannot be removed from a member");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", target.user_id)
    .maybeSingle();

  return {
    access,
    target,
    permission: permission!,
    appKey: isAppPermission ? appKey : null,
    targetEmail: profile?.email ?? null,
  };
}

/**
 * Store an Allow or Deny for one member and one permission.
 *
 * Cap-aware storage: an Allow the member's current app-access level caps out is
 * still stored, stays inert, and becomes effective if that level is later
 * raised — exactly as the resolver already behaves.
 */
export async function setMemberPermissionOverride(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  permissionKey: string;
  effect: string;
}) {
  if (args.effect !== "allow" && args.effect !== "deny") {
    throw new Error("Choose either allow or deny");
  }
  const effect = args.effect as OverrideEffect;
  const resolved = await authorizeOverrideMutation({ ...args, effect });

  // The override row and its audit entry commit together.
  const { data, error } = await supabaseAdmin.rpc("write_member_permission_override", {
    _workspace_id: args.workspaceId,
    _membership_id: resolved.target.id,
    _permission_id: resolved.permission.id,
    _effect: effect,
    _actor_user_id: args.actorUserId,
    _target_user_id: resolved.target.user_id,
    _target_email: resolved.targetEmail ?? "",
    _role_key: resolved.target.roleKey,
    _permission_key: resolved.permission.permission_key,
    _app_key: resolved.appKey ?? "",
  });
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as {
    changed?: boolean;
    previous_effect?: string;
    new_effect?: string;
  };
  return {
    ok: true as const,
    changed: Boolean(result.changed),
    previousEffect: result.previous_effect ?? "inherited",
    effect: result.new_effect ?? effect,
  };
}

/**
 * Remove a member's override so the permission returns to the role baseline.
 * Clearing an override that does not exist is a safe no-op.
 */
export async function clearMemberPermissionOverride(args: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
  permissionKey: string;
}) {
  const resolved = await authorizeOverrideMutation({ ...args, effect: "clear" });

  const { data, error } = await supabaseAdmin.rpc("write_member_permission_override", {
    _workspace_id: args.workspaceId,
    _membership_id: resolved.target.id,
    _permission_id: resolved.permission.id,
    _effect: "clear",
    _actor_user_id: args.actorUserId,
    _target_user_id: resolved.target.user_id,
    _target_email: resolved.targetEmail ?? "",
    _role_key: resolved.target.roleKey,
    _permission_key: resolved.permission.permission_key,
    _app_key: resolved.appKey ?? "",
  });
  if (error) throw new Error(error.message);

  const result = (data ?? {}) as { changed?: boolean; previous_effect?: string };
  return {
    ok: true as const,
    changed: Boolean(result.changed),
    previousEffect: result.previous_effect ?? "inherited",
    effect: "inherited" as const,
  };
}
