import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Create a one-time launch link for a suite app. The signed-in OneSuite user
 * is the only identity; the child app never asks for a password.
 *
 * Phase 1B-A: every new ticket is bound to a verified workspace.
 * - Explicit workspaceId: exactly that workspace is authorized, no fallback.
 * - No workspaceId (legacy): the existing resolver picks the workspace, with
 *   sso_eligible containment intact.
 * The rollout gate (workspace sso_eligible) applies to both paths.
 */
export const createAppLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { appSlug?: string; workspaceId?: string }) => ({
    appSlug: String(data?.appSlug ?? ""),
    workspaceId: data?.workspaceId === undefined ? null : String(data.workspaceId),
  }))
  .handler(async ({ data, context }) => {
    const { mintTicket, workspaceSsoEligible } = await import("@/lib/sso.server");
    const { resolveAppAuthorization, resolveWorkspaceAppAuthorization } = await import(
      "@/lib/workspace.server"
    );
    const { isWorkspaceId, rolloutGateAllows } = await import("@/lib/sso-scope.core");

    if (data.workspaceId !== null && !isWorkspaceId(data.workspaceId)) {
      return { url: null as string | null, reason: "no_access" as const };
    }

    const authz = data.workspaceId
      ? await resolveWorkspaceAppAuthorization(context.userId, data.workspaceId, data.appSlug)
      : await resolveAppAuthorization(context.userId, data.appSlug);

    if (!authz.authorized || authz.accessLevel === "no_access") {
      const reason =
        authz.reason === "invalid_app"
          ? ("invalid_app" as const)
          : authz.reason === "no_entitlement" ||
              authz.reason === "no_workspace" ||
              authz.reason === "no_membership"
            ? ("no_access" as const)
            : ("app_not_permitted" as const);
      return { url: null as string | null, reason };
    }

    const workspaceId = authz.workspaceId;
    if (!workspaceId || (data.workspaceId && workspaceId !== data.workspaceId)) {
      return { url: null as string | null, reason: "no_access" as const };
    }
    if (!rolloutGateAllows(await workspaceSsoEligible(workspaceId))) {
      return { url: null as string | null, reason: "app_not_permitted" as const };
    }

    const ticket = await mintTicket(context.userId, data.appSlug, workspaceId);
    return { url: ticket.url, reason: null };
  });
