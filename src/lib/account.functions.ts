import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Keep stored subscription state in sync with PayPal on every account load (incl. login).
    try {
      const { syncUserSubscriptions } = await import("./subscription.server");
      await syncUserSubscriptions(userId);
    } catch (err) {
      console.error("Subscription sync failed:", err);
    }

    const [profileRes, rolesRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("subscriptions")
        .select("id, tier, status, currency, amount, expires_at, created_at, payment_reference, payment_provider")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    const roles = (rolesRes.data ?? []).map((r) => r.role as string);
    // Kept for the payment history panel only — `subscriptions` is NO LONGER an
    // access authority. `access_entitlements` is the single access decision.
    const subscriptions = subsRes.data ?? [];
    const isSuperAdmin = roles.includes("super_admin");

    const { refreshEntitlementStatus } = await import("./access.server");
    const entitlement = await refreshEntitlementStatus(userId);
    const hasAccess = isSuperAdmin || entitlement?.access_status === "active";

    return {
      profile: profileRes.data ?? null,
      roles,
      isSuperAdmin,
      subscriptions,
      hasAccess,
      accessStatus: entitlement?.status ?? "none",
      planId: entitlement?.plan_id ?? null,
      unlockedTier: hasAccess ? 3 : 0,
    };
  });

/*
 * The former `startCheckout` server function was removed: it wrote a pending
 * row into the legacy `subscriptions` table, which is no longer an access
 * authority. All purchasing now goes through `billing.functions.ts`
 * (PayPal Orders) and writes into `access_entitlements`.
 */
