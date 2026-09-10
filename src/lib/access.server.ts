// Server-only: PayPal Orders (one-time payments) + fixed-term access management.
// Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addPeriod,
  getPlan,
  quotePrice,
  type BillingPeriod,
  type Currency,
  type PlanId,
  type SelectedAddOn,
  MONTHLY_METRICS,
  type PlanLimits,
} from "./plans";
import { getPaypalCredentials, paypalApiBase } from "./subscription.server";

export type AccessStatus = "none" | "active" | "expired";

/* ------------------------------------------------------------------ PayPal */

export async function paypalOrdersConfigured() {
  const { clientId, clientSecret } = await getPaypalCredentials();
  return Boolean(clientId && clientSecret);
}

async function token(): Promise<string> {
  const { requestPaypalToken } = await import("./subscription.server");
  const result = await requestPaypalToken();
  if (!result.ok) {
    if (result.error === "missing_credentials") throw new Error("PayPal is not configured yet.");
    throw new Error(`PayPal auth failed (${result.status ?? "unknown"})`);
  }
  return result.token;
}

/** Create a one-time PayPal order. No vaulting, no billing agreement, no plan id. */
export async function createPaypalOrder(args: {
  amount: number;
  currency: Currency;
  description: string;
  reference: string;
}) {
  const access = await token();
  const res = await fetch(`${await paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": args.reference,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: args.reference,
          description: args.description.slice(0, 127),
          amount: {
            currency_code: args.currency,
            value: args.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "TP-CAMP OneSuite",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  const body = (await res.json()) as { id?: string; message?: string };
  if (!res.ok || !body.id) {
    console.error("PayPal order create failed", res.status, body);
    throw new Error("Could not start the PayPal payment. Please try again.");
  }
  return body.id;
}

export type CaptureResult = {
  status: string;
  captureId: string | null;
  amount: number | null;
  currency: string | null;
};

export async function capturePaypalOrder(orderId: string): Promise<CaptureResult> {
  const access = await token();
  const res = await fetch(
    `${await paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `capture-${orderId}`,
      },
    },
  );
  const body = (await res.json()) as any;
  // 422 ORDER_ALREADY_CAPTURED -> fall back to reading the order
  if (!res.ok) {
    const issue = body?.details?.[0]?.issue;
    if (issue === "ORDER_ALREADY_CAPTURED") return getPaypalOrder(orderId);
    console.error("PayPal capture failed", res.status, JSON.stringify(body).slice(0, 500));
    throw new Error("PayPal could not complete the payment.");
  }
  const capture = body?.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: String(body?.status ?? "UNKNOWN"),
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ? Number(capture.amount.value) : null,
    currency: capture?.amount?.currency_code ?? null,
  };
}

export async function getPaypalOrder(orderId: string): Promise<CaptureResult> {
  const access = await token();
  const res = await fetch(
    `${await paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error("Could not read the PayPal order.");
  const capture = body?.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: String(body?.status ?? "UNKNOWN"),
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ? Number(capture.amount.value) : null,
    currency: capture?.amount?.currency_code ?? null,
  };
}

/* ------------------------------------------------------------- Entitlement */

export type EntitlementRow = {
  user_id: string;
  plan_id: string | null;
  billing_period: string | null;
  currency: string;
  addons: SelectedAddOn[];
  seats_extra: number;
  access_status: AccessStatus;
  access_start_date: string | null;
  access_expiry_date: string | null;
};

export async function readEntitlement(userId: string): Promise<EntitlementRow | null> {
  const { data } = await supabaseAdmin
    .from("access_entitlements")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as any),
    addons: Array.isArray((data as any).addons) ? ((data as any).addons as SelectedAddOn[]) : [],
    access_status: ((data as any).access_status ?? "none") as AccessStatus,
  };
}

/** Expire an entitlement whose paid period has lapsed. Data is never deleted. */
export async function refreshEntitlementStatus(userId: string) {
  const row = await readEntitlement(userId);
  if (!row) return null;
  const expired =
    row.access_expiry_date != null && new Date(row.access_expiry_date).getTime() <= Date.now();
  const next: AccessStatus = row.plan_id
    ? expired
      ? "expired"
      : "active"
    : "none";
  if (next !== row.access_status) {
    await supabaseAdmin
      .from("access_entitlements")
      .update({ access_status: next })
      .eq("user_id", userId);
    return { ...row, access_status: next };
  }
  return row;
}

/**
 * Activate or extend access after a verified payment. Idempotent: an order row
 * already marked `paid` is never applied twice, so duplicate webhook deliveries
 * and a webhook racing the server-side capture are both safe.
 */
export async function applyPaidOrder(orderRowId: string, captureId: string | null) {
  const { data: order } = await supabaseAdmin
    .from("plan_orders")
    .select("*")
    .eq("id", orderRowId)
    .maybeSingle();
  if (!order) return { applied: false as const, reason: "not_found" as const };
  if (order.payment_status === "paid") {
    return { applied: false as const, reason: "duplicate" as const, order };
  }

  const period = (order.billing_period === "monthly" ? "monthly" : "yearly") as BillingPeriod;
  const existing = await readEntitlement(order.user_id);
  const now = new Date();

  // Early renewal: stack the new period on top of the unused remainder.
  const base =
    existing?.access_expiry_date && new Date(existing.access_expiry_date).getTime() > now.getTime()
      ? new Date(existing.access_expiry_date)
      : now;
  const start =
    existing?.access_start_date && base.getTime() > now.getTime()
      ? existing.access_start_date
      : now.toISOString();
  const expiry = addPeriod(base, period).toISOString();

  const addons = Array.isArray(order.addons) ? (order.addons as SelectedAddOn[]) : [];
  const extraSeats = addons
    .filter((a) => a.id === "team_add")
    .reduce((sum, a) => sum + (a.quantity ?? 0), 0);

  await supabaseAdmin.from("access_entitlements").upsert(
    {
      user_id: order.user_id,
      plan_id: order.plan_id,
      billing_period: period,
      currency: order.currency,
      addons,
      seats_extra: extraSeats,
      access_status: "active",
      access_start_date: start,
      access_expiry_date: expiry,
    },
    { onConflict: "user_id" },
  );

  await supabaseAdmin
    .from("plan_orders")
    .update({
      payment_status: "paid",
      paypal_capture_id: captureId,
      paid_at: now.toISOString(),
      access_start_date: start,
      access_expiry_date: expiry,
    })
    .eq("id", orderRowId);

  // Keep the legacy subscriptions table in step so existing app gating still works.
  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: order.user_id,
      tier: 3,
      status: "active",
      currency: order.currency,
      amount: order.total_amount,
      payment_reference: order.paypal_order_id,
      payment_provider: "paypal",
      started_at: start,
      expires_at: expiry,
    },
    { onConflict: "payment_reference" },
  );

  return { applied: true as const, order, expiry, start };
}

/* ------------------------------------------------------------ Plan limits */

export function periodKeyFor(metric: keyof PlanLimits, when = new Date()) {
  const monthly = (MONTHLY_METRICS as readonly string[]).includes(metric);
  return monthly ? `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, "0")}` : "lifetime";
}

export async function readUsage(userId: string, metric: keyof PlanLimits) {
  const { data } = await supabaseAdmin
    .from("plan_limit_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("metric", metric)
    .eq("period_key", periodKeyFor(metric))
    .maybeSingle();
  return Number(data?.used ?? 0);
}

export function limitFor(planId: string | null, metric: keyof PlanLimits, extraSeats = 0) {
  const plan = getPlan(planId);
  if (!plan) return 0;
  const value = plan.limits[metric];
  return metric === "seats" ? value + extraSeats : value;
}

/** Quote helper re-exported so server functions never import the browser module twice. */
export const quote = quotePrice;
export type { BillingPeriod, Currency, PlanId, SelectedAddOn };
