// Pure WAM checkout + reconciliation logic. No I/O, no secrets, no floats in money math.
//
// USD (plans.ts) is the authoritative commercial price. WAM is a TTD-only
// settlement rail: the TTD amount is derived once, deterministically, and
// locked onto the order.

export const WAM_RATE_SETTING_KEY = "WAM_USD_TTD_RATE";
export const WAM_SETTLEMENT_CURRENCY = "TTD";
/** A pending order is only reused inside this window AND with an identical quote. */
export const WAM_PENDING_REUSE_MS = 30 * 60 * 1000;

export class WamRateUnavailableError extends Error {
  constructor() {
    super("WAM checkout is unavailable: no valid checkout rate is configured.");
    this.name = "WamRateUnavailableError";
  }
}

/** Rate as integer ten-thousandths (6.80 -> 68000). */
export type LockedRate = { scaled: number; text: string };

const RATE_RE = /^(\d{1,4})(?:\.(\d{1,4}))?$/;

/** Parses an administered rate. Returns null for anything not a positive decimal (max 4dp). */
export function parseRate(value: unknown): LockedRate | null {
  if (typeof value !== "string") return null;
  const m = RATE_RE.exec(value.trim());
  if (!m) return null;
  const scaled = Number(m[1]) * 10000 + Number((m[2] ?? "").padEnd(4, "0"));
  if (!Number.isSafeInteger(scaled) || scaled <= 0) return null;
  const text = `${Math.floor(scaled / 10000)}.${String(scaled % 10000).padStart(4, "0")}`;
  return { scaled, text };
}

/** Fails closed: no configured/valid rate means no payment intent. */
export function requireRate(value: unknown): LockedRate {
  const rate = parseRate(value);
  if (!rate) throw new WamRateUnavailableError();
  return rate;
}

/** USD amount (≤ 2dp, as produced by plans.ts) to integer cents. */
export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Invalid USD total.");
  const cents = Math.round(usd * 100);
  if (Math.abs(cents - usd * 100) > 1e-6) throw new Error("USD total has more than 2 decimals.");
  return cents;
}

/** Integer TTD cents = round_half_up(usdCents × rate). Pure integer arithmetic. */
export function convertUsdCentsToTtdCents(usdCents: number, rate: LockedRate): number {
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0) throw new Error("Invalid USD cents.");
  const product = BigInt(usdCents) * BigInt(rate.scaled);
  const cents = (product + 5000n) / 10000n;
  const n = Number(cents);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Converted amount out of range.");
  return n;
}

export function centsToDecimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export type QuoteIdentity = {
  userId: string;
  workspaceId: string | null;
  planId: string;
  billingPeriod: string;
  addons: { id: string; quantity: number }[];
  usdCents: number;
  rate: LockedRate;
  ttdCents: number;
};

/** Canonical string for the quote fingerprint (hash it with SHA-256). */
export function canonicalQuote(q: QuoteIdentity): string {
  const addons = [...q.addons]
    .map((a) => ({ id: a.id, quantity: a.quantity }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.quantity - b.quantity);
  return JSON.stringify([
    "wam-quote-v1",
    q.userId,
    q.workspaceId ?? null,
    q.planId,
    q.billingPeriod,
    addons,
    "USD",
    q.usdCents,
    q.rate.text,
    WAM_SETTLEMENT_CURRENCY,
    q.ttdCents,
  ]);
}

export function merchantReferenceFor(orderId: string) {
  return `tpcamp_wam_${orderId}`;
}

type PendingCandidate = {
  id: string;
  payment_provider: string;
  payment_status: string;
  quote_fingerprint: string | null;
  created_at: string;
};

/** Picks a reusable pending order only when the full quote fingerprint matches. */
export function selectReusableOrder<T extends PendingCandidate>(
  candidates: T[],
  fingerprint: string,
  now = new Date(),
): T | null {
  for (const c of candidates) {
    if (c.payment_provider !== "wam") continue;
    if (c.payment_status !== "created") continue;
    if (!c.quote_fingerprint || c.quote_fingerprint !== fingerprint) continue;
    if (now.getTime() - new Date(c.created_at).getTime() > WAM_PENDING_REUSE_MS) continue;
    return c;
  }
  return null;
}

/* ------------------------------------------------------------ Reconciliation */

export type WamOrderForReconcile = {
  id: string;
  payment_provider: string | null;
  payment_status: string;
  provider_reference: string | null;
  merchant_reference: string | null;
  payment_currency: string | null;
  payment_amount_cents: number | null;
};

export type WamVerifiedStatus = {
  paymentId: string;
  status: string;
  amountCents: number;
  currency: string;
  merchantReference: string | null;
  providerTransactionId: string | null;
  completedAt: string | null;
  isTerminal: boolean;
};

export type ReconcileDecision =
  | { action: "activate" }
  | { action: "duplicate" }
  | { action: "update_status"; paymentStatus: string; providerStatus: string }
  | { action: "reject"; reason: string };

const NON_SUCCESS_STATUS: Record<string, string> = {
  processing: "processing",
  failed: "failed",
  canceled: "canceled",
  expired: "expired",
};

/**
 * Decides what one verified WAM payment state means for one OneSuite order.
 * Only an exact match on provider, payment id, merchant reference, terminal
 * succeeded status, TTD currency and locked amount can activate.
 */
export function decideReconciliation(input: {
  order: WamOrderForReconcile;
  eventPaymentId: string;
  status: WamVerifiedStatus;
}): ReconcileDecision {
  const { order, status } = input;
  if (order.payment_provider !== "wam") return { action: "reject", reason: "wrong_provider" };
  if (!order.provider_reference || status.paymentId !== order.provider_reference) {
    return { action: "reject", reason: "wrong_payment_id" };
  }
  if (input.eventPaymentId !== status.paymentId) return { action: "reject", reason: "event_payment_id_mismatch" };
  if (!order.merchant_reference || status.merchantReference !== order.merchant_reference) {
    return { action: "reject", reason: "wrong_reference" };
  }
  if (order.payment_status === "paid") return { action: "duplicate" };

  if (status.status === "succeeded") {
    if (!status.isTerminal) return { action: "reject", reason: "not_terminal" };
    if (order.payment_currency !== WAM_SETTLEMENT_CURRENCY || String(status.currency).toUpperCase() !== WAM_SETTLEMENT_CURRENCY) {
      return { action: "reject", reason: "wrong_currency" };
    }
    if (
      order.payment_amount_cents == null ||
      !Number.isSafeInteger(status.amountCents) ||
      status.amountCents !== order.payment_amount_cents
    ) {
      return { action: "reject", reason: "wrong_amount" };
    }
    return { action: "activate" };
  }

  const mapped = NON_SUCCESS_STATUS[status.status];
  if (mapped) return { action: "update_status", paymentStatus: mapped, providerStatus: status.status };
  return { action: "reject", reason: "unsupported_status" };
}
