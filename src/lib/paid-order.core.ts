// Pure, provider-neutral paid-order activation logic. No I/O, no secrets.
// `applyPaidOrder()` in access.server.ts performs the writes this module plans.

import { addPeriod, type BillingPeriod, type SelectedAddOn } from "./plans";

/** Payment providers that may activate access through the shared path. */
export const PAID_ORDER_PROVIDERS = ["paypal", "wam", "paywise"] as const;
export type PaidOrderProvider = (typeof PAID_ORDER_PROVIDERS)[number];

export function isPaidOrderProvider(value: unknown): value is PaidOrderProvider {
  return (PAID_ORDER_PROVIDERS as readonly string[]).includes(String(value));
}

/**
 * Verified payment facts supplied by a provider-specific verifier
 * (PayPal capture, future WAM/PayWise reconciliation). Never browser input.
 */
export type VerifiedPayment = {
  provider: PaidOrderProvider;
  /** Provider-side order/intent reference (e.g. PayPal order id, WAM intent id). */
  providerReference: string | null;
  /** Provider-side capture/transaction id. */
  providerTransactionId: string | null;
  /** Provider's own status string, e.g. COMPLETED / succeeded. */
  providerStatus: string | null;
  /** When OneSuite verified the payment with the provider server-side. */
  verifiedAt: string;
  capturedAmount: number | null;
  capturedCurrency: string | null;
  capturedAt: string | null;
  captureStatus: string | null;
};

type OrderRow = {
  id: string;
  user_id: string;
  plan_id: string;
  billing_period: string;
  currency: string;
  total_amount: number;
  addons: unknown;
  payment_status: string;
  payment_provider?: string | null;
  paypal_order_id?: string | null;
};

type ExistingEntitlement = {
  access_start_date: string | null;
  access_expiry_date: string | null;
} | null;

export class PaidOrderProviderMismatch extends Error {
  constructor(orderProvider: string, paymentProvider: string) {
    super(`Order belongs to ${orderProvider}; refusing ${paymentProvider} activation.`);
    this.name = "PaidOrderProviderMismatch";
  }
}

/** Legacy PayPal callers pass only a capture id; map it to the neutral contract. */
export function paypalVerifiedPayment(
  order: Pick<OrderRow, "paypal_order_id">,
  captureId: string | null,
  now = new Date(),
): VerifiedPayment {
  return {
    provider: "paypal",
    providerReference: order.paypal_order_id ?? null,
    providerTransactionId: captureId,
    providerStatus: "COMPLETED",
    verifiedAt: now.toISOString(),
    capturedAmount: null,
    capturedCurrency: null,
    capturedAt: null,
    captureStatus: null,
  };
}

/**
 * Plans every write for one verified payment. Throws when the payment's
 * provider differs from the order's recorded provider, so WAM metadata can
 * never be stored against a PayPal order (or vice versa).
 */
export function planPaidOrderWrites(input: {
  order: OrderRow;
  existing: ExistingEntitlement;
  workspaceId: string | null;
  payment: VerifiedPayment;
  now?: Date;
}) {
  const { order, existing, workspaceId, payment } = input;
  const now = input.now ?? new Date();

  if (!isPaidOrderProvider(payment.provider)) {
    throw new Error("Unsupported payment provider.");
  }
  const orderProvider = (order.payment_provider ?? "paypal").trim() || "paypal";
  if (orderProvider !== payment.provider) {
    throw new PaidOrderProviderMismatch(orderProvider, payment.provider);
  }

  const period = (order.billing_period === "monthly" ? "monthly" : "yearly") as BillingPeriod;

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

  const entitlement = {
    user_id: order.user_id,
    workspace_id: workspaceId,
    plan_id: order.plan_id,
    billing_period: period,
    currency: order.currency,
    addons,
    seats_extra: extraSeats,
    access_status: "active" as const,
    status: "active" as const,
    subscription_source: payment.provider,
    payment_status: "paid" as const,
    access_start_date: start,
    access_expiry_date: expiry,
  };

  const orderUpdate: Record<string, unknown> = {
    payment_status: "paid",
    paid_at: now.toISOString(),
    access_start_date: start,
    access_expiry_date: expiry,
    provider_reference: payment.providerReference,
    provider_transaction_id: payment.providerTransactionId,
    provider_status: payment.providerStatus,
    provider_verified_at: payment.verifiedAt,
  };
  // Only overwrite capture facts when the verifier supplied them, so the
  // legacy PayPal capture step's earlier write is preserved.
  if (payment.capturedAmount != null) orderUpdate["captured_amount"] = payment.capturedAmount;
  if (payment.capturedCurrency != null) orderUpdate["captured_currency"] = payment.capturedCurrency;
  if (payment.capturedAt != null) orderUpdate["captured_at"] = payment.capturedAt;
  if (payment.captureStatus != null) orderUpdate["capture_status"] = payment.captureStatus;
  // Historical PayPal column stays PayPal-only.
  if (payment.provider === "paypal") orderUpdate["paypal_capture_id"] = payment.providerTransactionId;

  const subscription = {
    user_id: order.user_id,
    tier: 3,
    status: "active" as const,
    currency: order.currency,
    amount: order.total_amount,
    payment_reference:
      payment.provider === "paypal"
        ? (order.paypal_order_id ?? payment.providerReference)
        : (payment.providerReference ?? `${payment.provider}:${order.id}`),
    payment_provider: payment.provider,
    started_at: start,
    expires_at: expiry,
  };

  return { entitlement, orderUpdate, subscription, start, expiry };
}
