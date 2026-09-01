import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Cycle = "monthly" | "yearly";

/**
 * Called right after the PayPal button approves. The subscription is only marked
 * `active` when PayPal's API confirms it (server-side verification); otherwise it
 * is stored as `pending` and activated later by the webhook.
 */
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      PRICES,
      fetchPaypalSubscription,
      mapPaypalStatus,
      paypalConfigured,
      fallbackExpiry,
      resolvePlanMapping,
    } = await import("./subscription.server");

    const amount = PRICES[data.cycle][data.currency];

    let status: "pending" | "active" | "cancelled" | "expired" = "pending";
    let expiresAt: string | null = null;
    let tier = 3;

    if (await paypalConfigured()) {
      const sub = await fetchPaypalSubscription(data.subscriptionId);
      if (sub) {
        status = mapPaypalStatus(sub.status);
        expiresAt = sub.billing_info?.next_billing_time ?? fallbackExpiry(data.cycle);
        if (sub.plan_id) tier = (await resolvePlanMapping(sub.plan_id)).tier;
      }
    }

    const row = {
      user_id: context.userId,
      tier,
      status,
      currency: data.currency,
      amount,
      payment_reference: data.subscriptionId,
      payment_provider: "paypal",
      started_at: status === "active" ? new Date().toISOString() : null,
      expires_at: expiresAt,
    };

    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id")
      .eq("payment_reference", data.subscriptionId)
      .maybeSingle();

    // A payment reference already claimed by another account must never be
    // reassigned to the caller.
    if (existing && existing.user_id !== context.userId) {
      throw new Error("This subscription reference is not available.");
    }

    const { user_id: _ownerId, ...updatable } = row;

    const { error } = existing
      ? await supabaseAdmin
          .from("subscriptions")
          .update(updatable)
          .eq("id", existing.id)
          .eq("user_id", context.userId)
      : await supabaseAdmin.from("subscriptions").insert(row);


    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      subscriptionId: data.subscriptionId,
      cycle: data.cycle,
      amount,
      currency: data.currency,
      status,
      nextBillingDate: expiresAt,
    };
  });

/** Details for the /payment-success confirmation screen. */
export const getSubscriptionSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId?: string }) => ({
    subscriptionId:
      typeof data?.subscriptionId === "string" ? data.subscriptionId.trim().slice(0, 120) : "",
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const query = supabase
      .from("subscriptions")
      .select("id, status, currency, amount, expires_at, started_at, created_at, payment_reference")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: rows } = data.subscriptionId
      ? await query.eq("payment_reference", data.subscriptionId)
      : await query;

    const row = rows?.[0] ?? null;
    if (!row) return { found: false as const };

    const cycle: Cycle =
      Number(row.amount) === 49 || Number(row.amount) === 350 ? "monthly" : "yearly";

    return {
      found: true as const,
      status: row.status as string,
      currency: row.currency,
      amount: row.amount as number | null,
      cycle,
      nextBillingDate: row.expires_at as string | null,
      startedAt: (row.started_at ?? row.created_at) as string,
      reference: row.payment_reference as string | null,
    };
  });

/** User-initiated cancellation: cancels at PayPal, then downgrades locally. */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId?: string }) => ({
    subscriptionId:
      typeof data?.subscriptionId === "string" ? data.subscriptionId.trim().slice(0, 120) : "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.subscriptionId) throw new Error("Missing subscription reference");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cancelPaypalSubscription, paypalConfigured } = await import("./subscription.server");

    const { data: row } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, payment_provider, expires_at")
      .eq("payment_reference", data.subscriptionId)
      .maybeSingle();

    if (!row || row.user_id !== context.userId) throw new Error("Subscription not found");

    let paypalCancelled = false;
    if (row.payment_provider === "paypal" && (await paypalConfigured())) {
      const result = await cancelPaypalSubscription(data.subscriptionId, "Cancelled by customer");
      if (!result.ok) {
        throw new Error("We couldn't cancel with PayPal. Please try again or contact support.");
      }
      paypalCancelled = true;
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      paypalCancelled,
      accessUntil: row.expires_at as string | null,
    };
  });
