import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Cycle = "monthly" | "yearly";

export const recordPaypalSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId?: string; cycle?: Cycle; currency?: "USD" | "TTD" }) => {
    const subscriptionId = typeof data?.subscriptionId === "string" ? data.subscriptionId.trim() : "";
    if (!subscriptionId || subscriptionId.length > 120) {
      throw new Error("Invalid PayPal subscription id");
    }
    return {
      subscriptionId,
      cycle: (data?.cycle === "monthly" ? "monthly" : "yearly") as Cycle,
      currency: (data?.currency === "TTD" ? "TTD" : "USD") as "USD" | "TTD",
    };
  })
  .handler(async ({ data, context }) => {
    const prices = { monthly: { USD: 49, TTD: 350 }, yearly: { USD: 500, TTD: 3500 } } as const;
    const amount = prices[data.cycle][data.currency];

    const expires = new Date();
    if (data.cycle === "monthly") expires.setMonth(expires.getMonth() + 1);
    else expires.setFullYear(expires.getFullYear() + 1);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Optional server-side verification when PayPal API credentials are configured.
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const apiBase =
      process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com";
    let verifiedStatus: string | null = null;

    if (clientId && secret) {
      try {
        const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });
        const token = (await tokenRes.json()) as { access_token?: string };
        if (token.access_token) {
          const subRes = await fetch(
            `${apiBase}/v1/billing/subscriptions/${encodeURIComponent(data.subscriptionId)}`,
            { headers: { Authorization: `Bearer ${token.access_token}` } },
          );
          const sub = (await subRes.json()) as { status?: string };
          verifiedStatus = sub.status ?? null;
          if (verifiedStatus && !["ACTIVE", "APPROVED"].includes(verifiedStatus)) {
            throw new Error(`PayPal subscription is not active (${verifiedStatus})`);
          }
        }
      } catch (err) {
        console.error("PayPal verification failed:", err);
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("payment_reference", data.subscriptionId)
      .maybeSingle();

    const row = {
      user_id: context.userId,
      tier: 3,
      status: "active" as const,
      currency: data.currency,
      amount,
      payment_reference: data.subscriptionId,
      payment_provider: "paypal",
      started_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
    };

    const { error } = existing
      ? await supabaseAdmin.from("subscriptions").update(row).eq("id", existing.id)
      : await supabaseAdmin.from("subscriptions").insert(row);

    if (error) throw new Error(error.message);

    return { ok: true as const, subscriptionId: data.subscriptionId, cycle: data.cycle, amount };
  });
