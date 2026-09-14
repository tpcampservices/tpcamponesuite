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

function safeOrigin(value: unknown) {
  return typeof value === "string" && value.startsWith("http")
    ? value.replace(/\/$/, "").slice(0, 200)
    : "https://tpcamponesuite.app";
}

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

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      email?: string;
      roleKey?: string;
      displayName?: string;
      origin?: string;
      appAccess?: Record<string, string>;
    }) => ({
      email: String(data?.email ?? "").trim().toLowerCase().slice(0, 255),
      roleKey: String(data?.roleKey ?? "").trim(),
      displayName: String(data?.displayName ?? "").trim().slice(0, 120) || null,
      origin: safeOrigin(data?.origin),
      appAccess:
        data?.appAccess && typeof data.appAccess === "object"
          ? (data.appAccess as Record<string, string>)
          : null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { createInvitation } = await import("./invitations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The workspace is resolved from the session — a browser-supplied workspace
    // id is never accepted.
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");

    const { invitationId, token, expiresAt, seats } = await createInvitation({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      email: data.email,
      roleKey: data.roleKey,
      displayName: data.displayName,
      appAccess: data.appAccess,
    });

    const link = `${data.origin}/invite/${token}`;

    // Delivery: an email with no OneSuite account gets the existing auth invite,
    // which lands back on the acceptance link after they set a password.
    // Membership is still only created when the invitation is accepted.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    let emailSent = false;
    let emailError: string | null = null;
    if (!existing) {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: link,
      });
      if (error) emailError = error.message;
      else emailSent = true;
    }

    return { ok: true as const, invitationId, link, expiresAt, seats, emailSent, emailError };
  });

export const resendWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId?: string; origin?: string }) => ({
    invitationId: String(data?.invitationId ?? "").trim(),
    origin: safeOrigin(data?.origin),
  }))
  .handler(async ({ data, context }) => {
    const { resolveCurrentWorkspace } = await import("./workspace.server");
    const { resendInvitation } = await import("./invitations.server");
    const workspace = await resolveCurrentWorkspace(context.userId);
    if (!workspace) throw new Error("You do not have a workspace yet");

    const { token, expiresAt } = await resendInvitation({
      actorUserId: context.userId,
      workspaceId: workspace.id,
      invitationId: data.invitationId,
    });
    return { ok: true as const, link: `${data.origin}/invite/${token}`, expiresAt };
  });

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
