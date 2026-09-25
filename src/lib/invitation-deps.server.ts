/** Live dependencies for the invitation core. Server-only. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveAccess } from "./entitlement-model";
import { resolveCurrentWorkspace, workspaceEntitlementRow } from "./workspace.server";
import { assertMayInvite, createInvitation, resendInvitation } from "./invitations.server";
import type { InviteDeps } from "./invitations.core";

export function liveInviteDeps(actorUserId: string, requestOrigin: string | null): InviteDeps {
  return {
    actorUserId,
    requestOrigin,
    resolveWorkspaceId: async () => (await resolveCurrentWorkspace(actorUserId))?.id ?? null,
    assertMayInvite: async (ws) => {
      await assertMayInvite(actorUserId, ws);
    },
    planActive: async (ws) => {
      const row = await workspaceEntitlementRow(ws);
      if (!row || (row.workspace_id && row.workspace_id !== ws)) return false;
      return deriveAccess({ planId: row.plan_id, status: row.status, expiryDate: row.access_expiry_date }).hasAccess;
    },
    accountExists: async (email) => {
      const { data } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
      return !!data;
    },
    reserveSend: async ({ workspaceId, emailHash, kind }) => {
      const { data, error } = await supabaseAdmin.rpc("reserve_invitation_send", {
        _workspace_id: workspaceId,
        _actor_user_id: actorUserId,
        _email_hash: emailHash,
        _kind: kind,
        _invitation_id: null as never,
      });
      if (error) throw new Error(error.message);
      // 30-day retention: best-effort cleanup on each send; never blocks the invite.
      void supabaseAdmin.rpc("purge_invitation_send_ledger").then(() => {}, () => {});
      return String(data);
    },
    finalizeSend: async (id, ok) => {
      await supabaseAdmin.rpc("finalize_invitation_send", { _id: id, _ok: ok });
    },
    createInvitation: (a) => createInvitation({ actorUserId, ...a }),
    resendInvitation: async (a) => {
      const r = await resendInvitation({ actorUserId, ...a });
      return { token: r.token, expiresAt: r.expiresAt };
    },
    sendEmail: async (email, redirectTo) => {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
      return !error;
    },
    audit: async ({ workspaceId, action, maskedEmail, limit }) => {
      await supabaseAdmin.from("team_audit_log").insert({
        workspace_id: workspaceId,
        actor_user_id: actorUserId,
        target_email: maskedEmail,
        action,
        details: limit ? { limit } : {},
      });
    },
    log: (code) => console.warn(code),
  };
}
