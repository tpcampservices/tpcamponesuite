import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runProvision, type ProvisionResult } from "./workspace-provisioning.core";

/**
 * Phase 1A-C: Super Admin-only creation of an ADDITIONAL workspace for an
 * explicit target owner. No entitlement, subscription or SSO eligibility is
 * granted. Errors are returned as sanitized codes only.
 */
export const provisionAdditionalWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }): Promise<ProvisionResult> => {
    const claims = context.claims as { email?: string } | undefined;
    return runProvision({ userId: context.userId ?? null, email: claims?.email ?? null }, data, {
      isSuperAdmin: async (userId) => {
        const { data: ok, error } = await context.supabase.rpc("has_role", {
          _user_id: userId,
          _role: "super_admin",
        });
        if (error) throw new Error("role_check_failed");
        return ok === true;
      },
      callRoutine: async (args) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: out, error } = await supabaseAdmin.rpc(
          "provision_additional_workspace_atomic",
          args as never,
        );
        return { data: out, error: error ? { message: error.message } : null };
      },
      auditRejection: async ({ actorUserId, code, detail }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("admin_access_audit").insert({
          actor_user_id: actorUserId,
          actor_email: claims?.email ?? null,
          action: "provision_additional_workspace_rejected",
          details: { code, detail: detail.slice(0, 300) },
        });
      },
      log: (msg, detail) => console.error(msg, detail),
    });
  });
