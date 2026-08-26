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
    const subscriptions = subsRes.data ?? [];
    const isSuperAdmin = roles.includes("super_admin");

    const now = Date.now();
    const activeTiers = subscriptions
      .filter(
        (s) =>
          s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
      )
      .map((s) => s.tier as number);
    const highestTier = activeTiers.length ? Math.max(...activeTiers) : 0;

    return {
      profile: profileRes.data ?? null,
      roles,
      isSuperAdmin,
      subscriptions,
      unlockedTier: isSuperAdmin ? 3 : highestTier,
    };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { cycle?: "monthly" | "yearly"; currency?: "USD" | "TTD"; returnUrl?: string }) => {
      const cycle = data?.cycle === "monthly" ? "monthly" : "yearly";
      const currency = data?.currency === "TTD" ? "TTD" : "USD";
      const returnUrl =
        typeof data?.returnUrl === "string" && data.returnUrl.startsWith("http")
          ? data.returnUrl.slice(0, 500)
          : undefined;
      return { cycle: cycle as "monthly" | "yearly", currency: currency as "USD" | "TTD", returnUrl };
    },
  )
  .handler(async ({ data, context }) => {
    const prices = {
      monthly: { USD: 49, TTD: 350 },
      yearly: { USD: 500, TTD: 3500 },
    } as const;
    const amount = prices[data.cycle][data.currency];
    const reference = `tpcamp-onesuite-${data.cycle}-${crypto.randomUUID()}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: context.userId,
      tier: 3,
      status: "pending",
      currency: data.currency,
      amount,
      payment_reference: reference,
      payment_provider: "external",
    });
    if (error) throw new Error(error.message);



    const apiUrl = process.env.PAYMENT_PORTAL_API_URL;
    const apiKey = process.env.PAYMENT_PORTAL_API_KEY;

    if (!apiUrl) {
      return { configured: false as const, free: false, reference, amount, currency: data.currency };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        reference,
        plan: "onesuite",
        cycle: data.cycle,
        amount,
        currency: data.currency,
        customer_email: context.claims.email ?? null,
        return_url: data.returnUrl,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Payment portal request failed [${response.status}]: ${body}`);
      throw new Error(`Payment portal request failed [${response.status}]`);
    }

    const payload = (await response.json()) as {
      checkout_url?: string;
      url?: string;
      redirect_url?: string;
    };
    const checkoutUrl = payload.checkout_url ?? payload.url ?? payload.redirect_url ?? null;

    return { configured: true as const, reference, amount, currency: data.currency, checkoutUrl };
  });
