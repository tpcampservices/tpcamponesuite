// WAM checkout orchestrator with injected I/O so it can be tested directly.
// The server function (wam-checkout.functions.ts) wires the real dependencies.
import * as core from "./wam-checkout.core";
import { quotePrice, type BillingPeriod, type PlanId, type SelectedAddOn } from "./plans";

export type CheckoutOrderRow = {
  id: string;
  payment_provider: string | null;
  payment_status: string | null;
  quote_fingerprint: string | null;
  created_at: string;
  payment_amount_cents: number | null;
  merchant_reference: string | null;
  provider_reference: string | null;
};

export type CheckoutIntent = { paymentId: string; checkoutUrl: string; amountCents: number; currency: string; status: string };

export type CheckoutDeps = {
  isStagingTester(): Promise<boolean>;
  readRate(): Promise<string | null>;
  workspaceId(): Promise<string | null>;
  sha256(text: string): string;
  findCandidates(fingerprint: string): Promise<CheckoutOrderRow[]>;
  insertOrder(row: Record<string, unknown>): Promise<CheckoutOrderRow | null>;
  createIntent(input: {
    amountCents: number; currency: string; orderReference: string; idempotencyKey: string;
    description: string; returnUrl: string; metadata: Record<string, string>;
  }): Promise<CheckoutIntent>;
  markOrder(orderId: string, patch: Record<string, unknown>): Promise<void>;
  newId(): string;
  now(): Date;
  origin: string;
  userId: string;
};

export type CheckoutSelection = { planId: PlanId; billingPeriod: BillingPeriod; addons: SelectedAddOn[] };

export const CHECKOUT_UNAVAILABLE = "Card checkout is not available for this account yet.";
export const CHECKOUT_PREP_FAILED = "The payment could not be prepared. Please contact TP-CAMP support.";
export const CHECKOUT_RETRY = "We couldn't reach the payment provider. Please try again in a moment.";

/** Server-authoritative quote: USD from plans.ts, TTD from the locked admin rate. */
export async function quoteWamCheckout(deps: Pick<CheckoutDeps, "readRate">, sel: CheckoutSelection) {
  const rate = core.requireRate(await deps.readRate());
  const price = quotePrice({ ...sel, currency: "USD" });
  const usdCents = core.usdToCents(price.total);
  const ttdCents = core.convertUsdCentsToTtdCents(usdCents, rate);
  return { rate, price, usdCents, ttdCents };
}

export async function runWamCheckout(deps: CheckoutDeps, sel: CheckoutSelection) {
  if (!(await deps.isStagingTester())) throw new Error(CHECKOUT_UNAVAILABLE);
  // Fails closed (missing/invalid rate) before anything is written.
  const { rate, price, usdCents, ttdCents } = await quoteWamCheckout(deps, sel);
  const workspaceId = await deps.workspaceId();
  const fingerprint = deps.sha256(
    core.canonicalQuote({
      userId: deps.userId, workspaceId, planId: price.planId, billingPeriod: price.billingPeriod,
      addons: price.addons, usdCents, rate, ttdCents,
    }),
  );

  let order = core.selectReusableOrder(await deps.findCandidates(fingerprint), fingerprint, deps.now());
  if (!order) {
    const id = deps.newId();
    order = await deps.insertOrder({
      id, user_id: deps.userId, plan_id: price.planId, billing_period: price.billingPeriod,
      currency: "USD", base_price: price.basePrice, add_on_total: price.addOnTotal,
      onboarding_fee: price.onboardingFee, total_amount: price.total, addons: price.addons,
      payment_provider: "wam", payment_status: "created",
      payment_currency: core.WAM_SETTLEMENT_CURRENCY, payment_amount_cents: ttdCents,
      payment_amount: Number(core.centsToDecimal(ttdCents)), exchange_rate: Number(rate.text),
      quote_fingerprint: fingerprint, merchant_reference: core.merchantReferenceFor(id),
    });
    if (!order) throw new Error("Could not create the order. Please try again.");
  }

  let intent: CheckoutIntent;
  try {
    // Idempotency key = order id: a retry after a lost response returns the SAME
    // WAM intent instead of creating a second chargeable one.
    intent = await deps.createIntent({
      amountCents: order.payment_amount_cents!, currency: core.WAM_SETTLEMENT_CURRENCY,
      orderReference: order.merchant_reference!, idempotencyKey: order.id,
      description: `TP-CAMP OneSuite ${price.planName}`,
      returnUrl: `${deps.origin}/payment/wam/result?order=${order.id}`,
      metadata: { onesuite_order_id: order.id },
    });
  } catch {
    // Order stays "created" and reusable, so the next attempt retries safely.
    await deps.markOrder(order.id, { last_error: "wam_intent_request_failed" });
    throw new Error(CHECKOUT_RETRY);
  }

  if (intent.amountCents !== order.payment_amount_cents || String(intent.currency).toUpperCase() !== core.WAM_SETTLEMENT_CURRENCY) {
    await deps.markOrder(order.id, { payment_status: "failed", last_error: "wam_intent_mismatch" });
    throw new Error(CHECKOUT_PREP_FAILED);
  }
  if (order.provider_reference && order.provider_reference !== intent.paymentId) {
    await deps.markOrder(order.id, { last_error: "wam_intent_reference_mismatch" });
    throw new Error(CHECKOUT_PREP_FAILED);
  }
  if (!/^https:\/\//i.test(intent.checkoutUrl)) {
    await deps.markOrder(order.id, { last_error: "wam_checkout_url_invalid" });
    throw new Error(CHECKOUT_PREP_FAILED);
  }
  if (!order.provider_reference) {
    await deps.markOrder(order.id, { provider_reference: intent.paymentId, provider_status: String(intent.status), last_error: null });
  }

  return {
    orderId: order.id, checkoutUrl: intent.checkoutUrl, usdTotal: price.total,
    exchangeRate: rate.text, ttdAmount: core.centsToDecimal(order.payment_amount_cents!),
    ttdAmountCents: order.payment_amount_cents!,
  };
}
