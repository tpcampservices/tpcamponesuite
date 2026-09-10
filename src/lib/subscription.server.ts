// Server-only PayPal + subscription helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SubStatus = "pending" | "active" | "cancelled" | "expired";

export const PRICES = {
  monthly: { USD: 49 },
  yearly: { USD: 500 },
} as const;

export type PaypalEnvironment = "sandbox" | "live";

export const PAYPAL_API_HOSTS: Record<PaypalEnvironment, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

/** Base credential names; each is stored per environment as `${base}_SANDBOX` / `${base}_LIVE`. */
export const PAYPAL_SETTING_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
] as const;
export type PaypalSettingKey = (typeof PAYPAL_SETTING_KEYS)[number];

export const PAYPAL_ENVIRONMENT_KEY = "PAYPAL_ENVIRONMENT";

async function readSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("integration_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const value = (data?.value ?? "").trim();
  return value.length ? value : null;
}

/** Selected PayPal environment. Sandbox is the safe default until Live is chosen. */
export async function getPaypalEnvironment(): Promise<PaypalEnvironment> {
  const fromEnv = (process.env[PAYPAL_ENVIRONMENT_KEY] ?? "").trim().toLowerCase();
  if (fromEnv === "live" || fromEnv === "sandbox") return fromEnv;
  const stored = (await readSetting(PAYPAL_ENVIRONMENT_KEY))?.toLowerCase();
  return stored === "live" ? "live" : "sandbox";
}

export function paypalApiBaseFor(env: PaypalEnvironment) {
  return PAYPAL_API_HOSTS[env];
}

/** API host for the currently selected environment. */
export async function paypalApiBase() {
  return paypalApiBaseFor(await getPaypalEnvironment());
}

export function scopedKey(key: PaypalSettingKey, env: PaypalEnvironment) {
  return `${key}_${env.toUpperCase()}`;
}

/**
 * Credentials come from environment secrets first, then from the encrypted-at-rest
 * `integration_settings` table written by the admin settings screen. The table has
 * no anon/authenticated grants, so only server code can ever read these values.
 * Sandbox and Live values are stored under separate keys and never mixed. Legacy
 * unscoped values are still honoured, but only for the Live environment.
 */
export async function getPaypalCredential(
  key: PaypalSettingKey,
  env: PaypalEnvironment,
): Promise<string | null> {
  const scoped = scopedKey(key, env);
  const fromEnvScoped = process.env[scoped];
  if (fromEnvScoped) return fromEnvScoped.trim();
  if (env === "live" && process.env[key]) return (process.env[key] as string).trim();
  const stored = await readSetting(scoped);
  if (stored) return stored;
  if (env === "live") return readSetting(key);
  return null;
}

export async function getPaypalCredentials(env?: PaypalEnvironment) {
  const environment = env ?? (await getPaypalEnvironment());
  const [clientId, clientSecret, webhookId] = await Promise.all([
    getPaypalCredential("PAYPAL_CLIENT_ID", environment),
    getPaypalCredential("PAYPAL_CLIENT_SECRET", environment),
    getPaypalCredential("PAYPAL_WEBHOOK_ID", environment),
  ]);
  return { clientId, clientSecret, webhookId, environment, apiBase: paypalApiBaseFor(environment) };
}

export async function paypalConfigured() {
  const { clientId, clientSecret } = await getPaypalCredentials();
  return Boolean(clientId && clientSecret);
}

export type PaypalTokenResult =
  | { ok: true; token: string; environment: PaypalEnvironment; apiBase: string }
  | {
      ok: false;
      environment: PaypalEnvironment;
      apiBase: string;
      status: number | null;
      error: string | null;
      message: string | null;
      debugId: string | null;
    };

/** Requests an OAuth2 client-credentials token from the selected environment's host. */
export async function requestPaypalToken(env?: PaypalEnvironment): Promise<PaypalTokenResult> {
  const { clientId, clientSecret, environment, apiBase } = await getPaypalCredentials(env);
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      environment,
      apiBase,
      status: null,
      error: "missing_credentials",
      message: "Client ID or Client Secret is not set for this environment.",
      debugId: null,
    };
  }
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    message?: string;
    debug_id?: string;
  };
  if (!res.ok || !body.access_token) {
    const failure = {
      ok: false as const,
      environment,
      apiBase,
      status: res.status,
      error: body.error ?? null,
      message: body.error_description ?? body.message ?? null,
      debugId: body.debug_id ?? res.headers.get("paypal-debug-id"),
    };
    // Server-side troubleshooting log — never includes credential values.
    console.error("PayPal OAuth failed", {
      environment,
      apiBase,
      status: failure.status,
      error: failure.error,
      message: failure.message,
      debugId: failure.debugId,
    });
    return failure;
  }
  return { ok: true, token: body.access_token, environment, apiBase };
}

export async function paypalAccessToken(): Promise<string | null> {
  const result = await requestPaypalToken();
  return result.ok ? result.token : null;
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
