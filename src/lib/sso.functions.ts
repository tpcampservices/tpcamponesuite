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
    const { mintTicket, entitlementFor } = await import("@/lib/sso.server");
    const entitlement = await entitlementFor(context.userId);
    if (!entitlement.hasAccess) {
      return { url: null as string | null, reason: "no_access" as const };
    }
    const ticket = await mintTicket(context.userId, data.appSlug);
    return { url: ticket.url, reason: null };
  });
