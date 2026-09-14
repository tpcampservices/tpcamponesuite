import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Create a one-time launch link for a suite app. The signed-in OneSuite user
 * is the only identity; the child app never asks for a password.
 */
export const createAppLaunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { appSlug?: string }) => ({ appSlug: String(data?.appSlug ?? "") }))
  .handler(async ({ data, context }) => {
    const { mintTicket } = await import("@/lib/sso.server");
    const { resolveAppAuthorization } = await import("@/lib/workspace.server");

    // Everything is resolved from the verified session user: canonical app slug,
    // active membership, workspace entitlement, the app being in the plan, the
    // member's app access level and the role's permissions. The browser only
    // supplies the app slug, and an unknown slug is rejected outright.
    const authz = await resolveAppAuthorization(context.userId, data.appSlug);
    if (!authz.authorized || authz.accessLevel === "no_access") {
      const reason =
        authz.reason === "invalid_app"
          ? ("invalid_app" as const)
          : authz.reason === "no_entitlement" || authz.reason === "no_workspace"
            ? ("no_access" as const)
            : ("app_not_permitted" as const);
      return { url: null as string | null, reason };
    }

    const ticket = await mintTicket(context.userId, data.appSlug);
    return { url: ticket.url, reason: null };
  });
