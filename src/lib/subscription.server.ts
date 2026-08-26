// Server-only PayPal + subscription helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SubStatus = "pending" | "active" | "cancelled" | "expired";

export const PRICES = {
  monthly: { USD: 49, TTD: 350 },
  yearly: { USD: 500, TTD: 3500 },
} as const;

export function paypalApiBase() {
  return process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com";
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function paypalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
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

export function fallbackExpiry(cycle: "monthly" | "yearly") {
  const d = new Date();
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/**
 * Reconcile a user's subscription rows on login:
 * - expires any active row whose expires_at has passed
 * - re-checks live PayPal state when API credentials are configured
 */
export async function syncUserSubscriptions(userId: string) {
  const { data: rows, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, expires_at, payment_reference, payment_provider")
    .eq("user_id", userId);
  if (error || !rows?.length) return;

  const now = Date.now();

  for (const row of rows) {
    let nextStatus: SubStatus = row.status as SubStatus;
    let nextExpiry = row.expires_at as string | null;

    if (row.payment_provider === "paypal" && row.payment_reference && paypalConfigured()) {
      const sub = await fetchPaypalSubscription(row.payment_reference);
      if (sub) {
        nextStatus = mapPaypalStatus(sub.status);
        if (sub.billing_info?.next_billing_time) nextExpiry = sub.billing_info.next_billing_time;
      }
    }

    if (
      nextStatus === "active" &&
      nextExpiry &&
      new Date(nextExpiry).getTime() < now
    ) {
      nextStatus = "expired";
    }

    if (nextStatus !== row.status || nextExpiry !== row.expires_at) {
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: nextStatus, expires_at: nextExpiry })
        .eq("id", row.id);
    }
  }
}
