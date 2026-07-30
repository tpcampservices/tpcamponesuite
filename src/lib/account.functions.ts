import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [profileRes, rolesRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("subscriptions")
        .select("id, tier, status, currency, amount, expires_at, created_at, payment_reference")
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
  .inputValidator((data: { tier: number; currency?: "USD" | "TTD"; returnUrl?: string }) => {
    const tier = Number(data?.tier);
    if (![1, 2, 3].includes(tier)) throw new Error("Invalid tier");
    const currency = data?.currency === "TTD" ? "TTD" : "USD";
    const returnUrl =
      typeof data?.returnUrl === "string" && data.returnUrl.startsWith("http")
        ? data.returnUrl.slice(0, 500)
        : undefined;
    return { tier, currency, returnUrl };
  })
  .handler(async ({ data, context }) => {
    const prices: Record<number, { USD: number; TTD: number }> = {
      1: { USD: 300, TTD: 2000 },
      2: { USD: 500, TTD: 3700 },
      3: { USD: 700, TTD: 5000 },
    };
    const amount = prices[data.tier][data.currency];
    const reference = `tpcamp-${data.tier}-${crypto.randomUUID()}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: context.userId,
      tier: data.tier,
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
      return { configured: false as const, reference, amount, currency: data.currency };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        reference,
        tier: data.tier,
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
