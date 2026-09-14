/**
 * Server-only workspace invitation logic.
 *
 * Security model:
 *  - The inviter, their workspace and their permission always come from a
 *    verified session; nothing about authority is read from the browser.
 *  - Seat capacity is enforced inside a single database routine that takes an
 *    advisory lock per workspace, so two simultaneous requests can never both
 *    claim the last seat.
 *  - Only a SHA-256 hash of the invitation token is stored. The raw token exists
 *    only in the invitation link.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  entitledApps,
  getSeatAccounting,
  resolveWorkspaceAccess,
  type SeatAccounting,
} from "./workspace.server";
import { ROLE_LABELS, type AppAccessLevel, type SystemRoleKey } from "./permissions";
import type { AppSlug } from "./apps";

/** Invitation lifetime. */
export const INVITATION_TTL_DAYS = 7;

/** Roles that may be offered in an invitation. Owner is deliberately absent. */
export const INVITABLE_ROLE_KEYS = [
  "administrator",
  "manager",
  "staff",
  "viewer",
  "auditor",
] as const;
export type InvitableRoleKey = (typeof INVITABLE_ROLE_KEYS)[number];

/** Authority ordering — a lower number is more powerful. */
const ROLE_RANK: Record<string, number> = {
  owner: 0,
  administrator: 1,
  manager: 2,
  staff: 3,
  viewer: 4,
  auditor: 4,
};

/** Temporary role → app-access preset. The Team & Access UI will refine this. */
const ROLE_APP_ACCESS: Record<InvitableRoleKey, AppAccessLevel> = {
  administrator: "manage",
  manager: "edit",
  staff: "edit",
  viewer: "view",
  auditor: "view",
};

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, 255);
}

export function isValidEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export function isInvitableRole(value: unknown): value is InvitableRoleKey {
  return (INVITABLE_ROLE_KEYS as readonly string[]).includes(String(value));
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function systemRoleId(roleKey: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("workspace_roles")
    .select("id")
    .is("workspace_id", null)
    .eq("role_key", roleKey)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The caller's authority to administer this workspace's team. `userId` MUST come
 * from a verified session. Owner always qualifies; anyone else needs the
 * workspace team permission from their role mapping.
 */
export async function assertMayInvite(userId: string, workspaceId: string) {
  const access = await resolveWorkspaceAccess(userId, workspaceId);
  if (access.membershipStatus !== "active") throw new Error("You are not an active member of this workspace");
  const may = access.isOwner || access.permissions.includes("workspace.team.invite");
  if (!may) throw new Error("You do not have permission to invite team members");
  return access;
}

/** An inviter may never assign Owner, nor a role above their own authority. */
function assertRoleAssignable(actorRoleKey: string | null, isOwner: boolean, roleKey: string) {
  if (roleKey === "owner") {
    throw new Error("Ownership cannot be granted through an invitation");
  }
  if (!isInvitableRole(roleKey)) throw new Error("Choose a valid workspace role");
  if (isOwner) return;
  const actorRank = ROLE_RANK[actorRoleKey ?? ""] ?? 99;
  if ((ROLE_RANK[roleKey] ?? 99) < actorRank) {
    throw new Error("You cannot assign a role with more authority than your own");
  }
}

export type InvitationSummary = {
  id: string;
  email: string;
  displayName: string | null;
  roleKey: string;
  roleName: string;
  status: string;
  expiresAt: string;
  lastSentAt: string;
  resendCount: number;
  createdAt: string;
};

function mapPgError(message: string) {
  if (/duplicate_invitation/.test(message)) {
    return "There is already a pending invitation for that email address";
  }
  if (/already_member/.test(message)) return "That person is already a member of this workspace";
  if (/no_seat_available/.test(message)) {
    return "All seats on your plan are in use or reserved by pending invitations";
  }
  if (/workspace_invitations_pending_unique/.test(message)) {
    return "There is already a pending invitation for that email address";
  }
  return message;
}

/** Create an invitation atomically. Returns the raw token exactly once. */
export async function createInvitation(args: {
  actorUserId: string;
  workspaceId: string;
  email: string;
  roleKey: string;
  displayName?: string | null;
}): Promise<{ invitationId: string; token: string; expiresAt: string; seats: SeatAccounting }> {
  const access = await assertMayInvite(args.actorUserId, args.workspaceId);
  assertRoleAssignable(access.roleKey, access.isOwner, args.roleKey);

  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) throw new Error("Enter a valid email address");

  const roleId = await systemRoleId(args.roleKey);
  if (!roleId) throw new Error("That workspace role is not available");

  // The single seat calculation supplies the allowance; the database enforces it.
  const seats = await getSeatAccounting(args.workspaceId);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin.rpc("create_workspace_invitation", {
    _workspace_id: args.workspaceId,
    _email: email,
    _role_id: roleId,
    _invited_by: args.actorUserId,
    _token_hash: await hashToken(token),
    _expires_at: expiresAt,
    _display_name: args.displayName?.slice(0, 120) ?? null,
    _total_seats: seats.totalSeats,
  });
  if (error) throw new Error(mapPgError(error.message));

  const invitationId = String(data);
  await supabaseAdmin.from("team_audit_log").insert({
    workspace_id: args.workspaceId,
    actor_user_id: args.actorUserId,
    target_email: email,
    action: "invitation_created",
    role_key: args.roleKey,
    details: { invitation_id: invitationId, expires_at: expiresAt },
  });

  return { invitationId, token, expiresAt, seats: await getSeatAccounting(args.workspaceId) };
}

/** Rotate the token and restart the expiry. The previous link stops working. */
export async function resendInvitation(args: {
  actorUserId: string;
  workspaceId: string;
  invitationId: string;
}): Promise<{ token: string; email: string; expiresAt: string }> {
  await assertMayInvite(args.actorUserId, args.workspaceId);

  const { data: inv } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, email, status, expires_at")
    .eq("id", args.invitationId)
    .maybeSingle();
  if (!inv || inv.workspace_id !== args.workspaceId) throw new Error("That invitation was not found");
  if (inv.status !== "pending" || new Date(inv.expires_at).getTime() <= Date.now()) {
    throw new Error("Only a pending invitation can be resent");
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await supabaseAdmin
    .from("workspace_invitations")
    .update({
      token_hash: await hashToken(token),
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
      resend_count: ((inv as any).resend_count ?? 0) + 1,
    })
    .eq("id", inv.id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("team_audit_log").insert({
    workspace_id: args.workspaceId,
    actor_user_id: args.actorUserId,
    target_email: inv.email,
    action: "invitation_resent",
    details: { invitation_id: inv.id, expires_at: expiresAt },
  });

  return { token, email: inv.email, expiresAt };
}

/** Cancel an invitation; its reserved seat is released immediately. */
export async function cancelInvitation(args: {
  actorUserId: string;
  workspaceId: string;
  invitationId: string;
}) {
  await assertMayInvite(args.actorUserId, args.workspaceId);

  const { data: inv } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, email, status")
    .eq("id", args.invitationId)
    .maybeSingle();
  if (!inv || inv.workspace_id !== args.workspaceId) throw new Error("That invitation was not found");
  if (inv.status === "accepted") throw new Error("That invitation has already been accepted");

  await supabaseAdmin
    .from("workspace_invitations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: args.actorUserId,
    })
    .eq("id", inv.id)
    .neq("status", "accepted");

  await supabaseAdmin.from("team_audit_log").insert({
    workspace_id: args.workspaceId,
    actor_user_id: args.actorUserId,
    target_email: inv.email,
    action: "invitation_cancelled",
    details: { invitation_id: inv.id },
  });

  return { ok: true as const, seats: await getSeatAccounting(args.workspaceId) };
}

export type InvitationPreview = {
  valid: boolean;
  reason?: "invalid" | "expired" | "cancelled" | "accepted";
  workspaceName?: string;
  invitedBy?: string | null;
  roleName?: string;
  email?: string;
  expiresAt?: string;
};

/**
 * Safe public lookup by raw token. Returns display information only — no
 * workspace ids, user ids, membership ids or token hashes.
 */
export async function previewInvitation(rawToken: string): Promise<InvitationPreview> {
  const tokenHash = await hashToken(rawToken);
  const { data: inv } = await supabaseAdmin
    .from("workspace_invitations")
    .select(
      "id, email, status, expires_at, invited_by, workspaces(name, status), workspace_roles(role_key, name)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!inv) return { valid: false, reason: "invalid" };
  if (inv.status === "cancelled") return { valid: false, reason: "cancelled" };
  if (inv.status === "accepted") return { valid: false, reason: "accepted" };
  if (inv.status !== "pending" || new Date(inv.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("workspace_invitations")
      .update({ status: "expired" })
      .eq("id", inv.id)
      .eq("status", "pending");
    return { valid: false, reason: "expired" };
  }

  let invitedBy: string | null = null;
  if (inv.invited_by) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", inv.invited_by)
      .maybeSingle();
    invitedBy = p?.full_name ?? null;
  }

  const role = inv.workspace_roles as unknown as { role_key: string; name: string } | null;
  const ws = inv.workspaces as unknown as { name: string; status: string } | null;

  return {
    valid: true,
    workspaceName: ws?.name ?? "your team workspace",
    invitedBy,
    roleName: role?.name ?? ROLE_LABELS[(role?.role_key ?? "staff") as SystemRoleKey] ?? "Member",
    email: inv.email,
    expiresAt: inv.expires_at,
  };
}

export type AcceptResult =
  | { ok: true; alreadyMember: boolean; workspaceName: string; roleKey: string }
  | { ok: false; reason: string };

/**
 * Accept an invitation. Every check is repeated server-side and the membership,
 * app access, invitation state and audit rows are written in one transaction
 * inside the database routine.
 */
export async function acceptInvitation(args: {
  rawToken: string;
  userId: string;
  email: string;
}): Promise<AcceptResult> {
  const tokenHash = await hashToken(args.rawToken);

  const { data: inv } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, role_id, workspace_roles(role_key)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!inv) return { ok: false, reason: "invalid" };

  const roleKey = (inv.workspace_roles as unknown as { role_key: string } | null)?.role_key ?? "";
  const preset = ROLE_APP_ACCESS[roleKey as InvitableRoleKey] ?? "view";

  // Intersection of the workspace's entitled apps with the role preset — a role
  // can never unlock an app the subscription does not include.
  const apps = await entitledApps(inv.workspace_id);
  const appAccess = Object.fromEntries(apps.map((key: AppSlug) => [key, preset]));

  const seats = await getSeatAccounting(inv.workspace_id);

  const { data, error } = await supabaseAdmin.rpc("accept_workspace_invitation", {
    _token_hash: tokenHash,
    _user_id: args.userId,
    _email: normalizeEmail(args.email),
    _total_seats: seats.totalSeats,
    _app_access: appAccess,
  });
  if (error) return { ok: false, reason: error.message };

  const result = data as {
    ok: boolean;
    reason?: string;
    already_member?: boolean;
    workspace_name?: string;
    role_key?: string;
  };
  if (!result?.ok) return { ok: false, reason: result?.reason ?? "invalid" };
  return {
    ok: true,
    alreadyMember: Boolean(result.already_member),
    workspaceName: result.workspace_name ?? "your team workspace",
    roleKey: result.role_key ?? roleKey,
  };
}

/** Invitation list for a workspace. Token hashes are never selected. */
export async function listInvitations(
  actorUserId: string,
  workspaceId: string,
): Promise<InvitationSummary[]> {
  await assertMayInvite(actorUserId, workspaceId);
  const { data } = await supabaseAdmin
    .from("workspace_invitations")
    .select(
      "id, email, display_name, status, expires_at, last_sent_at, resend_count, created_at, workspace_roles(role_key, name)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((row: any) => {
    const lapsed = row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now();
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name ?? null,
      roleKey: row.workspace_roles?.role_key ?? "",
      roleName: row.workspace_roles?.name ?? "",
      status: lapsed ? "expired" : row.status,
      expiresAt: row.expires_at,
      lastSentAt: row.last_sent_at,
      resendCount: row.resend_count ?? 0,
      createdAt: row.created_at,
    };
  });
}
