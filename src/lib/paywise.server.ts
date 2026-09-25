// Server-only PayWise Payments API client (Phase 1: sandbox only). Never import from client code.

export const PAYWISE_API_VERSION = "2024-10-01";
export const PAYWISE_SANDBOX_BASE = "https://sandbox-api.paywise.co";
export const PAYWISE_ORIGIN_COUNTRY = "TT";
export const PAYWISE_USER_AGENT = "TP-CAMP-OneSuite/1.0";

export const PAYWISE_SECRET_NAMES = [
  "PAYWISE_SUBSCRIPTION_KEY",
  "PAYWISE_BUSINESS_API_KEY",
  "PAYWISE_ENVIRONMENT",
  "PAYWISE_IP_ADDRESS",
] as const;

export class PaywiseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaywiseConfigError";
  }
}

type Env = Record<string, string | undefined>;

export type PaywiseConfig = {
  environment: "sandbox";
  baseUrl: string;
  subscriptionKey: string;
  businessApiKey: string;
  ipAddress: string;
};

/** Reads config at call time. Fails safely with a clear message when anything is missing. */
export function readPaywiseConfig(env: Env = process.env): PaywiseConfig {
  const environment = (env["PAYWISE_ENVIRONMENT"] ?? "").trim().toLowerCase();
  if (environment !== "sandbox") {
    throw new PaywiseConfigError(
      "PayWise is limited to the sandbox in Phase 1. Set PAYWISE_ENVIRONMENT to 'sandbox'.",
    );
  }
  const missing: string[] = [];
  const subscriptionKey = (env["PAYWISE_SUBSCRIPTION_KEY"] ?? "").trim();
  const businessApiKey = (env["PAYWISE_BUSINESS_API_KEY"] ?? "").trim();
  const ipAddress = (env["PAYWISE_IP_ADDRESS"] ?? "").trim();
  if (!subscriptionKey) missing.push("PAYWISE_SUBSCRIPTION_KEY");
  if (!businessApiKey) missing.push("PAYWISE_BUSINESS_API_KEY");
  if (!ipAddress) missing.push("PAYWISE_IP_ADDRESS");
  if (missing.length) {
    throw new PaywiseConfigError(`PayWise is not configured: missing ${missing.join(", ")}.`);
  }
  return { environment: "sandbox", baseUrl: PAYWISE_SANDBOX_BASE, subscriptionKey, businessApiKey, ipAddress };
}

/** UTC `YYYY-MM-DD HH:mm:ss`, as PayWise requires. */
export function paywiseRequestDate(now = new Date()) {
  return now.toISOString().slice(0, 19).replace("T", " ");
}

export function paywiseHeaders(cfg: PaywiseConfig, now = new Date()): Record<string, string> {
  return {
    "content-type": "application/json",
    "PW-subscription-key": cfg.subscriptionKey,
    "PW-ip-address": cfg.ipAddress,
    "PW-origin-country": PAYWISE_ORIGIN_COUNTRY,
    "PW-request-date": paywiseRequestDate(now),
    "User-Agent": PAYWISE_USER_AGENT,
  };
}

export function paywiseUrl(cfg: PaywiseConfig, path: string, query: Record<string, string> = {}) {
  const url = new URL(path, cfg.baseUrl);
  url.searchParams.set("version", PAYWISE_API_VERSION);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

const SENSITIVE = /(api[_-]?key|subscription[_-]?key|secret|token|password|authorization|card|cvv|cvc|pan|pin)/i;

/** Deep-copies a value, replacing any sensitive-looking field with "[redacted]". */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type PaywiseResult = { ok: boolean; status: number; body: unknown };

async function send(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<PaywiseResult> {
  const res = await fetchImpl(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) console.error("PayWise request failed", { status: res.status, body: redact(body) });
  return { ok: res.ok, status: res.status, body: redact(body) };
}

/** POST /payments/request — business api_key goes in the JSON body only. Not called by customer flows in Phase 1. */
export async function createPaymentRequest(
  payload: Record<string, unknown>,
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: Date } = {},
) {
  const cfg = readPaywiseConfig(deps.env);
  const body = { ...payload, api_key: cfg.businessApiKey };
  return send(
    paywiseUrl(cfg, "/payments/request"),
    { method: "POST", headers: paywiseHeaders(cfg, deps.now), body: JSON.stringify(body) },
    deps.fetchImpl ?? fetch,
  );
}

/** GET /payments/status — server-side verification (used for activation only in Phase 2). */
export async function getPaymentStatus(
  query: Record<string, string>,
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: Date } = {},
) {
  const cfg = readPaywiseConfig(deps.env);
  return send(
    paywiseUrl(cfg, "/payments/status", query),
    { method: "GET", headers: paywiseHeaders(cfg, deps.now) },
    deps.fetchImpl ?? fetch,
  );
}
