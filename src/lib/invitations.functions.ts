import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InvitationSummary } from "./invitations.server";
import type { TeamMember } from "./members.server";

/**
 * Workspace team invitations. The browser only ever submits an email, a desired
 * role and an optional display name. The inviter, their workspace, their
 * permission, the seat allowance, the token and the expiry are all decided on
 * the server from the verified session.
 */

import { coreInvite, coreResend } from "./invitations.core";

/** The signed-in user's workspace, seat position, members and invitation list. */
export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveCurrentWorkspace, resolveWorkspaceAccess, getSeatAccounting, entitledApps } =
      await import("./workspace.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) {
      return {
        workspace: null,
        access: null,
        seats: null,
        invitations: [],
        members: [],
        entitledApps: [] as string[],
        rolePresets: {} as Record<string, string>,
      };
    }

    const [access, seats, apps] = await Promise.all([
      resolveWorkspaceAccess(context.userId, workspace.id),
      getSeatAccounting(workspace.id),
      entitledApps(workspace.id),
    ]);

    const mayView =
      access.isOwner ||
      access.permissions.includes("workspace.team.view") ||
      access.permissions.includes("workspace.team.invite") ||
      access.permissions.includes("workspace.team.manage");

    const { INVITABLE_ROLE_KEYS, roleAppAccessPreset } = await import("./invitations.server");
    const rolePresets = Object.fromEntries(
      INVITABLE_ROLE_KEYS.map((key) => [key, roleAppAccessPreset(key)]),
    );

    let invitations: InvitationSummary[] = [];
    let members: TeamMember[] = [];
    if (mayView) {
      const { listInvitations } = await import("./invitations.server");
      const { listMembers } = await import("./members.server");
      [invitations, members] = await Promise.all([
        listInvitations(context.userId, workspace.id),
        listMembers(context.userId, workspace.id),
      ]);
    }

    return { workspace, access, seats, invitations, members, entitledApps: apps, rolePresets };
  });

// Every invite/resend goes through the gated core. The link origin is never
// taken from input; only an exact trusted Origin header is honoured.
async function inviteDeps(userId: string) {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { liveInviteDeps } = await import("./invitation-deps.server");
  return liveInviteDeps(userId, getRequestHeader("origin") ?? null);
}

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      email?: string;
      roleKey?: string;
      displayName?: string;
      appAccess?: Record<string, string>;
    }) => ({
      email: String(data?.email ?? "").slice(0, 400),
      roleKey: String(data?.roleKey ?? "").trim(),
      displayName: String(data?.displayName ?? "").trim().slice(0, 120) || null,
      appAccess:
        data?.appAccess && typeof data.appAccess === "object"
          ? (data.appAccess as Record<string, string>)
          : null,
    }),
  )
  .handler(async ({ data, context }) => coreInvite(await inviteDeps(context.userId), data));

export const resendWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId?: string }) => ({
    invitationId: String(data?.invitationId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => coreResend(await inviteDeps(context.userId), data));

export const cancelWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId?: string }) => ({
    invitationId: String(data?.invitationId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { cancelInvitation } = await import("./invitations.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return cancelInvitation({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      invitationId: data.invitationId,
    });
  });

/** Public, token-only lookup. Returns display information, never internal ids. */
export const previewWorkspaceInvitation = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string }) => ({
    token: String(data?.token ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    if (!data.token) return { valid: false as const, reason: "invalid" as const };
    const { previewInvitation } = await import("./invitations.server");
    return previewInvitation(data.token);
  });

export const acceptWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token?: string }) => ({
    token: String(data?.token ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    const email = String(context.claims.email ?? "");
    if (!email) return { ok: false as const, reason: "email_mismatch" };
    const { acceptInvitation } = await import("./invitations.server");
    return acceptInvitation({ rawToken: data.token, userId: context.userId, email });
  });

/* --------------------------------------------------- existing member actions */

/**
 * Every action below resolves the acting user's workspace and permission from
 * the verified session. The browser only names a membership inside that same
 * workspace, an app key and a level — all validated server-side.
 */

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId?: string; roleKey?: string }) => ({
    membershipId: String(data?.membershipId ?? "").trim(),
    roleKey: String(data?.roleKey ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { changeMemberRole } = await import("./members.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return changeMemberRole({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      membershipId: data.membershipId,
      roleKey: data.roleKey,
    });
  });

export const updateMemberAppAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId?: string; appKey?: string; level?: string }) => ({
    membershipId: String(data?.membershipId ?? "").trim(),
    appKey: String(data?.appKey ?? "").trim(),
    level: String(data?.level ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { setMemberAppAccess } = await import("./members.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return setMemberAppAccess({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      membershipId: data.membershipId,
      appKey: data.appKey,
      level: data.level,
    });
  });

export const updateMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId?: string; status?: string }) => ({
    membershipId: String(data?.membershipId ?? "").trim(),
    status: String(data?.status ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { setMemberStatus } = await import("./members.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return setMemberStatus({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      membershipId: data.membershipId,
      status: data.status,
    });
  });

/* ------------------------------- advanced (member-specific) permissions */

/**
 * Allow or Deny one permission for one member. The acting user's workspace and
 * their `workspace.permissions.manage` authority are resolved from the verified
 * session; the browser only names a membership in that same workspace and a
 * permission key, both validated against the canonical catalogue server-side.
 */
export const updateMemberPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId?: string; permissionKey?: string; effect?: string }) => ({
    membershipId: String(data?.membershipId ?? "").trim(),
    permissionKey: String(data?.permissionKey ?? "").trim().slice(0, 120),
    effect: String(data?.effect ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { setMemberPermissionOverride } = await import("./members.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return setMemberPermissionOverride({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      membershipId: data.membershipId,
      permissionKey: data.permissionKey,
      effect: data.effect,
    });
  });

/** Remove a member's override so the permission returns to their role baseline. */
export const removeMemberPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { membershipId?: string; permissionKey?: string }) => ({
    membershipId: String(data?.membershipId ?? "").trim(),
    permissionKey: String(data?.permissionKey ?? "").trim().slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { clearMemberPermissionOverride } = await import("./members.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");
    return clearMemberPermissionOverride({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      membershipId: data.membershipId,
      permissionKey: data.permissionKey,
    });
  });
