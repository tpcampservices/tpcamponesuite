// Server-only PayPal + subscription helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SubStatus = "pending" | "active" | "cancelled" | "expired";

export const PRICES = {
  monthly: { USD: 49, TTD: 350 },
  yearly: { USD: 500, TTD: 3500 },
} as const;

export const PAYPAL_SETTING_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
] as const;
export type PaypalSettingKey = (typeof PAYPAL_SETTING_KEYS)[number];

export function paypalApiBase() {
  return process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com";
}

/**
 * Credentials come from environment secrets first, then from the encrypted-at-rest
 * `integration_settings` table written by the admin settings screen. The table has
 * no anon/authenticated grants, so only server code can ever read these values.
 */
export async function getPaypalCredential(key: PaypalSettingKey): Promise<string | null> {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  const { data } = await supabaseAdmin
    .from("integration_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const value = (data?.value ?? "").trim();
  return value.length ? value : null;
}

export async function getPaypalCredentials() {
  const [clientId, clientSecret, webhookId] = await Promise.all([
    getPaypalCredential("PAYPAL_CLIENT_ID"),
    getPaypalCredential("PAYPAL_CLIENT_SECRET"),
    getPaypalCredential("PAYPAL_WEBHOOK_ID"),
  ]);
  return { clientId, clientSecret, webhookId };
}

export async function paypalConfigured() {
  const { clientId, clientSecret } = await getPaypalCredentials();
  return Boolean(clientId && clientSecret);
}

export async function paypalAccessToken(): Promise<string | null> {
  const { clientId, clientSecret } = await getPaypalCredentials();
  if (!clientId || !clientSecret) return null;
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    console.error("PayPal token request failed", res.status);
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export type PaypalSubscription = {
  id: string;
  status?: string;
  billing_info?: { next_billing_time?: string };
  plan_id?: string;
};

export async function fetchPaypalSubscription(id: string): Promise<PaypalSubscription | null> {
  const token = await paypalAccessToken();
  if (!token) return null;
  const res = await fetch(
    `${paypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error("PayPal subscription lookup failed", id, res.status);
    return null;
  }
  return (await res.json()) as PaypalSubscription;
}

export async function cancelPaypalSubscription(id: string, reason: string) {
  const token = await paypalAccessToken();
  if (!token) return { ok: false as const, reason: "not_configured" as const };
  const res = await fetch(
    `${paypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.slice(0, 120) }),
    },
  );
  // 204 = cancelled, 422 = already cancelled
  if (res.status === 204 || res.status === 422) return { ok: true as const };
  const body = await res.text();
  console.error("PayPal cancel failed", res.status, body);
  return { ok: false as const, reason: "paypal_error" as const };
}

/** Map a PayPal subscription status to our stored status. */
export function mapPaypalStatus(status: string | undefined | null): SubStatus {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "APPROVAL_PENDING":
    case "APPROVED":
    case "SUSPENDED":
      return "pending";
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

export type PlanMapping = {
  planId: string;
  tier: number;
  cycle: "monthly" | "yearly";
  currency: string;
  amount: number | null;
  label: string | null;
};

/**
 * Resolve a PayPal plan_id to the access tier / cycle it grants.
 * The mapping lives in `paypal_plans` so plans can be added, upgraded or
 * downgraded without a code change. Unknown plan ids fall back to the full
 * suite tier so a paying customer is never locked out.
 */
export async function resolvePlanMapping(planId: string | null | undefined): Promise<PlanMapping> {
  const fallback: PlanMapping = {
    planId: planId ?? "",
    tier: 3,
    cycle: "yearly",
    currency: "USD",
    amount: null,
    label: null,
  };
  if (!planId) return fallback;

  const { data } = await supabaseAdmin
    .from("paypal_plans")
    .select("plan_id, tier, cycle, currency, amount, label")
    .eq("plan_id", planId)
    .maybeSingle();

  if (!data) {
    console.warn("Unknown PayPal plan_id — defaulting to full suite access:", planId);
    return fallback;
  }

  return {
    planId: data.plan_id,
    tier: Number(data.tier),
    cycle: data.cycle === "monthly" ? "monthly" : "yearly",
    currency: data.currency ?? "USD",
    amount: data.amount === null ? null : Number(data.amount),
    label: data.label ?? null,
  };
}

export function fallbackExpiry(cycle: "monthly" | "yearly") {
  const d = new Date();
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/**
 * Reconcile a user's subscription rows on login:
 * - expires any active row whose expires_at has passed
 * - re-checks live PayPal state (status, tier from plan_id, next billing) when configured
 */
export async function syncUserSubscriptions(userId: string) {
  const { data: rows, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, tier, status, expires_at, payment_reference, payment_provider")
    .eq("user_id", userId);
  if (error || !rows?.length) return;

  const now = Date.now();
  const configured = await paypalConfigured();

  for (const row of rows) {
    let nextStatus: SubStatus = row.status as SubStatus;
    let nextExpiry = row.expires_at as string | null;
    let nextTier = Number(row.tier);

    if (row.payment_provider === "paypal" && row.payment_reference && configured) {
      const sub = await fetchPaypalSubscription(row.payment_reference);
      if (sub) {
        nextStatus = mapPaypalStatus(sub.status);
        if (sub.billing_info?.next_billing_time) nextExpiry = sub.billing_info.next_billing_time;
        if (sub.plan_id) {
          const mapping = await resolvePlanMapping(sub.plan_id);
          nextTier = mapping.tier;
        }
      }
    }

    if (nextStatus === "active" && nextExpiry && new Date(nextExpiry).getTime() < now) {
      nextStatus = "expired";
    }

    if (nextStatus !== row.status || nextExpiry !== row.expires_at || nextTier !== Number(row.tier)) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: nextStatus, expires_at: nextExpiry, tier: nextTier })
        .eq("id", row.id);
    }
  }
}
