import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mints a short-lived, single-use handoff ticket for one child app.
 * The entitlement decision is re-verified server-side both here and again
 * when the child app redeems the ticket.
 */
export const createAppTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { app?: string; returnTo?: string }) => ({
    app: String(data?.app ?? ""),
    returnTo: String(data?.returnTo ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    const { isAppSlug, computeEntitlement, issueTicket, APP_ORIGINS, safeReturnUrl } =
      await import("@/lib/entitlement.server");

    if (!isAppSlug(data.app)) {
      return { ok: false as const, reason: "unknown_app" as const };
    }

    const entitlement = await computeEntitlement(
      context.userId,
      (context.claims.email as string | undefined) ?? null,
    );
    if (!entitlement.subscription_active || !entitlement.entitled_apps.includes(data.app)) {
      return { ok: false as const, reason: "not_entitled" as const };
    }

    const { ticket, expiresAt } = await issueTicket(context.userId, data.app);

    // Preserve the page the user originally asked for, but only when it belongs
    // to the same child app we are handing off to.
    const requested = safeReturnUrl(data.returnTo);
    const origin = APP_ORIGINS[data.app];
    const returnTo = requested && requested.startsWith(`${origin}/`) ? requested : null;

    const url =
      `${origin}/sso/callback?ticket=${encodeURIComponent(ticket)}&app=${data.app}` +
      (returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : "");
    return { ok: true as const, url, expiresAt };
  });
