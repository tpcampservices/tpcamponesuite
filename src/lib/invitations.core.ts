/**
 * Invitation send path with injected dependencies, so the server actions and
 * the tests run the same code. Order for an initial invitation:
 *   workspace (from session) → permission → active plan → normalize email →
 *   atomic send reservation (only when an email will actually be sent) →
 *   create invitation → send email → finalize reservation.
 * Resend never sends an email; it only returns a fresh trusted link to an
 * authorized inviter, so it uses no send allowance.
 */
import { inviteLink } from "./invitation-links";
import type { SeatAccounting } from "./workspace.server";

export const INVITE_PLAN_REFUSED = "Your plan must be active to invite team members.";
export const INVITE_RATE_LIMITED = "Too many invitations right now. Try again later.";
export const INVITE_EMAIL_FAILED = "The invitation email couldn't be sent. Share the link below instead.";

export const INVITE_LIMITS = [
  "sender_hourly",
  "sender_daily",
  "workspace_daily",
  "recipient_daily",
  "reinvite_daily",
  "sender_failures",
] as const;

export function normalizeInviteEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, 255);
}

export async function emailHash(normalized: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** j***@gmail.com — enough for an admin to recognise, not the full address. */
export function maskEmail(normalized: string): string {
  const at = normalized.lastIndexOf("@");
  if (at < 1) return "***";
  return `${normalized[0]}***${normalized.slice(at)}`;
}

export function limitFromError(e: unknown): string | null {
  const m = e instanceof Error ? e.message : String(e ?? "");
  const hit = /invite_limit:([a-z_]+)/.exec(m);
  return hit ? hit[1] : null;
}

export type InviteDeps = {
  actorUserId: string;
  requestOrigin: string | null;
  resolveWorkspaceId: () => Promise<string | null>;
  assertMayInvite: (workspaceId: string) => Promise<void>;
  planActive: (workspaceId: string) => Promise<boolean>;
  accountExists: (email: string) => Promise<boolean>;
  reserveSend: (a: { workspaceId: string; emailHash: string; kind: "initial" | "resend" }) => Promise<string>;
  finalizeSend: (reservationId: string, ok: boolean) => Promise<void>;
  createInvitation: (a: {
    workspaceId: string;
    email: string;
    roleKey: string;
    displayName: string | null;
    appAccess: Record<string, string> | null;
  }) => Promise<{ invitationId: string; token: string; expiresAt: string; seats: SeatAccounting }>;
  resendInvitation: (a: { workspaceId: string; invitationId: string }) => Promise<{ token: string; expiresAt: string }>;
  sendEmail: (email: string, redirectTo: string) => Promise<boolean>;
  audit: (row: { workspaceId: string; action: string; maskedEmail: string; limit: string | null }) => Promise<void>;
  log: (code: string) => void;
};

export type InviteInput = {
  email: string;
  roleKey: string;
  displayName: string | null;
  appAccess: Record<string, string> | null;
};

export async function coreInvite(d: InviteDeps, input: InviteInput) {
  const workspaceId = await d.resolveWorkspaceId();
  if (!workspaceId) throw new Error("You do not have a workspace yet");
  await d.assertMayInvite(workspaceId);

  const email = normalizeInviteEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");

  if (!(await d.planActive(workspaceId))) {
    await d.audit({ workspaceId, action: "invitation_refused_plan", maskedEmail: maskEmail(email), limit: null });
    d.log("invite_refused_plan");
    throw new Error(INVITE_PLAN_REFUSED);
  }

  const willEmail = !(await d.accountExists(email));
  let reservation: string | null = null;
  if (willEmail) {
    try {
      reservation = await d.reserveSend({ workspaceId, emailHash: await emailHash(email), kind: "initial" });
    } catch (e) {
      const limit = limitFromError(e);
      if (!limit) throw e;
      await d.audit({ workspaceId, action: "invitation_refused_rate_limited", maskedEmail: maskEmail(email), limit });
      d.log(`invite_refused_${limit}`);
      throw new Error(INVITE_RATE_LIMITED);
    }
  }

  let created: Awaited<ReturnType<InviteDeps["createInvitation"]>>;
  try {
    created = await d.createInvitation({ workspaceId, ...input, email });
  } catch (e) {
    // Nothing was sent: the reservation stops counting (recorded as not sent).
    if (reservation) await d.finalizeSend(reservation, false);
    throw e;
  }

  const link = inviteLink(d.requestOrigin, created.token);
  let emailSent = false;
  if (reservation) {
    try {
      emailSent = await d.sendEmail(email, link);
    } catch {
      emailSent = false;
    }
    await d.finalizeSend(reservation, emailSent);
    if (!emailSent) d.log("invite_email_failed");
  }

  return {
    ok: true as const,
    invitationId: created.invitationId,
    link,
    expiresAt: created.expiresAt,
    seats: created.seats,
    emailSent,
    emailError: reservation && !emailSent ? INVITE_EMAIL_FAILED : null,
  };
}

export async function coreResend(d: InviteDeps, input: { invitationId: string }) {
  const workspaceId = await d.resolveWorkspaceId();
  if (!workspaceId) throw new Error("You do not have a workspace yet");
  await d.assertMayInvite(workspaceId);
  const { token, expiresAt } = await d.resendInvitation({ workspaceId, invitationId: input.invitationId });
  return { ok: true as const, link: inviteLink(d.requestOrigin, token), expiresAt };
}
