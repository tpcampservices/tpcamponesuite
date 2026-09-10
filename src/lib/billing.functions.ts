import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ADD_ONS,
  type AddOnId,
  type BillingPeriod,
  type Currency,
  type PlanId,
  type PlanLimits,
  type SelectedAddOn,
} from "./plans";

const PLAN_IDS: PlanId[] = ["starter", "growth", "pro", "institutional"];
const ADDON_IDS = ADD_ONS.map((a) => a.id) as AddOnId[];

type Selection = {
  planId?: string;
  billingPeriod?: string;
  currency?: string;
  addons?: { id?: string; quantity?: number }[];
};

/** Normalises whatever the browser sent. Amounts are NEVER accepted from the client. */
function parseSelection(data: Selection) {
  const planId = (PLAN_IDS as string[]).includes(data?.planId ?? "")
    ? (data!.planId as PlanId)
    : "starter";
  const billingPeriod: BillingPeriod = data?.billingPeriod === "monthly" ? "monthly" : "yearly";
  const currency: Currency = "USD";
  const addons: SelectedAddOn[] = (data?.addons ?? [])
    .filter((a) => (ADDON_IDS as string[]).includes(a?.id ?? ""))
    .map((a) => ({ id: a.id as AddOnId, quantity: Math.max(1, Math.min(50, Number(a.quantity) || 1)) }));
  return { planId, billingPeriod, currency, addons };
}

/** Authoritative, server-calculated quote for the checkout summary. */
export const getQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Selection) => parseSelection(data))
  .handler(async ({ data }) => {
    const { quotePrice } = await import("./plans");
    return quotePrice(data);
  });

/** Creates a one-time PayPal order (Orders API) and the matching audit row. */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Selection) => parseSelection(data))
  .handler(async ({ data, context }) => {
    const { quotePrice } = await import("./plans");
    const { createPaypalOrder, paypalOrdersConfigured } = await import("./access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const price = quotePrice(data);
    if (!(await paypalOrdersConfigured())) {
      throw new Error("PayPal is not configured yet. Please contact TP-CAMP support.");
    }

    const reference = `tpcamp-${price.planId}-${crypto.randomUUID()}`;
    const paypalOrderId = await createPaypalOrder({
      amount: price.total,
      currency: price.currency,
      description: `TP-CAMP OneSuite ${price.planName} — ${price.billingPeriod === "yearly" ? "12 months" : "1 month"} access`,
      reference,
    });

    const { data: row, error } = await supabaseAdmin
      .from("plan_orders")
      .insert({
        user_id: context.userId,
        plan_id: price.planId,
        billing_period: price.billingPeriod,
        currency: price.currency,
        base_price: price.basePrice,
        add_on_total: price.addOnTotal,
        onboarding_fee: price.onboardingFee,
        total_amount: price.total,
        addons: price.addons as never,
        paypal_order_id: paypalOrderId,
        payment_status: "created",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { orderId: paypalOrderId, orderRowId: row.id, total: price.total, currency: price.currency };
  });

/** Server-side capture + access activation. Idempotent. */
export const captureOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId?: string }) => ({
    orderId: typeof data?.orderId === "string" ? data.orderId.trim().slice(0, 120) : "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.orderId) throw new Error("Missing PayPal order reference");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { capturePaypalOrder, applyPaidOrder } = await import("./access.server");

    const { data: row } = await supabaseAdmin
      .from("plan_orders")
      .select("id, user_id, payment_status, access_expiry_date")
      .eq("paypal_order_id", data.orderId)
      .maybeSingle();
    if (!row || row.user_id !== context.userId) throw new Error("Order not found");

    if (row.payment_status === "paid") {
      return { ok: true as const, status: "paid" as const, expiry: row.access_expiry_date };
    }

    const capture = await capturePaypalOrder(data.orderId);
    if (capture.status !== "COMPLETED") {
      await supabaseAdmin
        .from("plan_orders")
        .update({ payment_status: capture.status.toLowerCase() })
        .eq("id", row.id);
      return { ok: false as const, status: capture.status };
    }

    const applied = await applyPaidOrder(row.id, capture.captureId);
    return {
      ok: true as const,
      status: "paid" as const,
      expiry: applied.applied ? applied.expiry : (applied.order?.access_expiry_date ?? null),
    };
  });

/** Marks an abandoned/cancelled checkout so the record is not left dangling. */
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId?: string }) => ({
    orderId: typeof data?.orderId === "string" ? data.orderId.trim().slice(0, 120) : "",
  }))
  .handler(async ({ data, context }) => {
    if (!data.orderId) return { ok: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("plan_orders")
      .update({ payment_status: "cancelled" })
      .eq("paypal_order_id", data.orderId)
      .eq("user_id", context.userId)
      .eq("payment_status", "created");
    return { ok: true as const };
  });

/** Everything the dashboard and billing screens need. */
export const getAccessState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { refreshEntitlementStatus, limitFor, periodKeyFor } = await import("./access.server");
    const { getPlan, LIMIT_LABELS } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const entitlement = await refreshEntitlementStatus(context.userId);

    const [{ data: orders }, { data: usageRows }] = await Promise.all([
      supabaseAdmin
        .from("plan_orders")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("plan_limit_usage").select("metric, period_key, used").eq("user_id", context.userId),
    ]);

    const plan = getPlan(entitlement?.plan_id ?? null);
    const usage = (Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((metric) => {
      const key = periodKeyFor(metric);
      const row = (usageRows ?? []).find((u) => u.metric === metric && u.period_key === key);
      return {
        metric,
        label: LIMIT_LABELS[metric],
        used: Number(row?.used ?? 0),
        limit: limitFor(entitlement?.plan_id ?? null, metric, entitlement?.seats_extra ?? 0),
      };
    });

    return {
      entitlement: entitlement
        ? {
            planId: entitlement.plan_id,
            planName: plan?.name ?? null,
            billingPeriod: (entitlement.billing_period ?? null) as BillingPeriod | null,
            currency: entitlement.currency,
            addons: entitlement.addons,
            seatsExtra: entitlement.seats_extra,
            status: entitlement.access_status,
            startDate: entitlement.access_start_date,
            expiryDate: entitlement.access_expiry_date,
          }
        : null,
      orders: (orders ?? []).map((o) => ({
        id: o.id,
        planId: o.plan_id,
        billingPeriod: o.billing_period,
        currency: o.currency,
        basePrice: Number(o.base_price),
        addOnTotal: Number(o.add_on_total),
        onboardingFee: Number(o.onboarding_fee),
        total: Number(o.total_amount),
        status: o.payment_status,
        provider: o.payment_provider,
        reference: o.paypal_order_id,
        captureId: o.paypal_capture_id,
        paidAt: o.paid_at,
        accessStart: o.access_start_date,
        accessExpiry: o.access_expiry_date,
        createdAt: o.created_at,
      })),
      usage,
    };
  });

/**
 * Entitlement gate used before creating a limited record. Suite apps call this
 * with a metric name; it refuses once the plan allowance is reached and never
 * touches existing data.
 */
export const consumeLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { metric?: string; amount?: number }) => ({
    metric: String(data?.metric ?? ""),
    amount: Math.max(1, Math.min(100, Number(data?.amount) || 1)),
  }))
  .handler(async ({ data, context }) => {
    const { refreshEntitlementStatus, limitFor, readUsage, periodKeyFor } = await import("./access.server");
    const { getPlan, LIMIT_LABELS } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const metric = data.metric as keyof PlanLimits;
    if (!(metric in LIMIT_LABELS)) throw new Error("Unknown limit");

    const entitlement = await refreshEntitlementStatus(context.userId);
    if (!entitlement || entitlement.access_status !== "active") {
      return {
        allowed: false as const,
        reason: "expired" as const,
        message: "Your TP-CAMP access has expired. Renew your plan to restore full access.",
      };
    }

    const plan = getPlan(entitlement.plan_id);
    const limit = limitFor(entitlement.plan_id, metric, entitlement.seats_extra);
    const used = await readUsage(context.userId, metric);

    if (used + data.amount > limit) {
      return {
        allowed: false as const,
        reason: "limit" as const,
        message: `You've reached your ${plan?.name ?? "current"} plan limit for ${LIMIT_LABELS[metric].toLowerCase()}.`,
        used,
        limit,
      };
    }

    await supabaseAdmin.from("plan_limit_usage").upsert(
      {
        user_id: context.userId,
        metric,
        period_key: periodKeyFor(metric),
        used: used + data.amount,
      },
      { onConflict: "user_id,metric,period_key" },
    );

    return { allowed: true as const, used: used + data.amount, limit };
  });

/**
 * Publishable PayPal client id + environment for the browser SDK.
 * The client id is public by design; the secret never leaves the server.
 */
export const getPaypalClientConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getPaypalCredentials } = await import("./subscription.server");
    const { clientId, environment } = await getPaypalCredentials();
    return { clientId: clientId ?? null, environment };
  });
