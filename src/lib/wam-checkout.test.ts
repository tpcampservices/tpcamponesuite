import { describe, expect, it, vi } from "vitest";
import {
  WamRateUnavailableError,
  canonicalQuote,
  convertUsdCentsToTtdCents,
  decideReconciliation,
  parseRate,
  requireRate,
  selectReusableOrder,
  usdToCents,
  type WamOrderForReconcile,
  type WamVerifiedStatus,
} from "./wam-checkout.core";
import { reconcileWamPayment, type ReconcileDeps } from "./wam-reconcile";
import { EXTERNAL_PAYMENT_SOURCES, MANUAL_GRANT_SOURCES, isManualGrantSource } from "./entitlement-model";
import { PaidOrderProviderMismatch, paypalVerifiedPayment, planPaidOrderWrites } from "./paid-order.core";

const rate = requireRate("6.80");

describe("rate governance", () => {
  it.each([null, undefined, "", " ", "abc", "0", "0.0000", "-6.8", "6.80001", "1e3", "NaN"])(
    "fails closed for %p",
    (v) => {
      expect(parseRate(v)).toBeNull();
      expect(() => requireRate(v)).toThrow(WamRateUnavailableError);
    },
  );
  it("parses administered decimals exactly", () => {
    expect(parseRate("6.80")).toEqual({ scaled: 68000, text: "6.8000" });
    expect(parseRate("6.7891")?.scaled).toBe(67891);
  });
});

describe("deterministic conversion", () => {
  it("converts USD cents to TTD cents with integer half-up rounding", () => {
    expect(convertUsdCentsToTtdCents(usdToCents(29), rate)).toBe(19720);
    expect(convertUsdCentsToTtdCents(usdToCents(0.01), rate)).toBe(7); // 6.8 -> 7
    expect(convertUsdCentsToTtdCents(1, requireRate("6.7499"))).toBe(7);
    expect(convertUsdCentsToTtdCents(1, requireRate("6.4999"))).toBe(6);
    expect(convertUsdCentsToTtdCents(usdToCents(199.99), rate)).toBe(135993);
  });
  it("is stable across repeated calls", () => {
    const a = convertUsdCentsToTtdCents(12345, rate);
    for (let i = 0; i < 100; i++) expect(convertUsdCentsToTtdCents(12345, rate)).toBe(a);
  });
  it("rejects invalid USD totals", () => {
    expect(() => usdToCents(0)).toThrow();
    expect(() => usdToCents(1.005)).toThrow();
  });
});

const base = {
  userId: "u1",
  workspaceId: "w1",
  planId: "pro",
  billingPeriod: "yearly",
  addons: [{ id: "team_add", quantity: 2 }],
  usdCents: 19900,
  rate,
  ttdCents: convertUsdCentsToTtdCents(19900, rate),
};

describe("quote fingerprint / idempotency", () => {
  it("is order-insensitive for add-ons but sensitive to every commercial input", () => {
    const fp = canonicalQuote(base);
    expect(canonicalQuote({ ...base, addons: [...base.addons] })).toBe(fp);
    for (const changed of [
      { userId: "u2" },
      { workspaceId: "w2" },
      { planId: "growth" },
      { billingPeriod: "monthly" },
      { addons: [{ id: "team_add", quantity: 3 }] },
      { usdCents: 19901 },
      { rate: requireRate("6.81") },
      { ttdCents: base.ttdCents + 1 },
    ]) {
      expect(canonicalQuote({ ...base, ...changed })).not.toBe(fp);
    }
  });

  const now = new Date("2026-10-06T00:30:00Z");
  const cand = (o: Record<string, unknown>) => ({
    id: "o1",
    payment_provider: "wam",
    payment_status: "created",
    quote_fingerprint: "fp",
    created_at: "2026-10-06T00:10:00Z",
    ...o,
  });
  it("reuses only an identical, recent, pending WAM order", () => {
    expect(selectReusableOrder([cand({})], "fp", now)?.id).toBe("o1");
    expect(selectReusableOrder([cand({ quote_fingerprint: "other" })], "fp", now)).toBeNull();
    expect(selectReusableOrder([cand({ payment_status: "paid" })], "fp", now)).toBeNull();
    expect(selectReusableOrder([cand({ payment_provider: "paypal" })], "fp", now)).toBeNull();
    expect(selectReusableOrder([cand({ created_at: "2026-10-05T23:00:00Z" })], "fp", now)).toBeNull();
  });
  it("a changed global rate yields a different quote, so existing orders are never re-priced", () => {
    const locked = { ...base };
    const newRate = requireRate("7.10");
    const fresh = { ...base, rate: newRate, ttdCents: convertUsdCentsToTtdCents(19900, newRate) };
    expect(canonicalQuote(fresh)).not.toBe(canonicalQuote(locked));
    expect(locked.ttdCents).toBe(135320); // unchanged
  });
});

const order = (o: Partial<WamOrderForReconcile> = {}): WamOrderForReconcile => ({
  id: "order-1",
  payment_provider: "wam",
  payment_status: "created",
  provider_reference: "pay-1",
  merchant_reference: "tpcamp_wam_order-1",
  payment_currency: "TTD",
  payment_amount_cents: 135320,
  ...o,
});
const status = (s: Partial<WamVerifiedStatus> = {}): WamVerifiedStatus => ({
  paymentId: "pay-1",
  status: "succeeded",
  amountCents: 135320,
  currency: "TTD",
  merchantReference: "tpcamp_wam_order-1",
  providerTransactionId: "tx-1",
  completedAt: "2026-10-06T00:00:00Z",
  isTerminal: true,
  ...s,
});

describe("reconciliation decision", () => {
  const d = (o = order(), s = status(), e = "pay-1") => decideReconciliation({ order: o, status: s, eventPaymentId: e });
  it("activates only on an exact match", () => expect(d().action).toBe("activate"));
  it("rejects wrong provider", () => expect(d(order({ payment_provider: "paypal" }))).toEqual({ action: "reject", reason: "wrong_provider" }));
  it("rejects wrong payment id", () => expect(d(order(), status({ paymentId: "pay-2" }))).toMatchObject({ reason: "wrong_payment_id" }));
  it("rejects wrong reference", () => expect(d(order(), status({ merchantReference: "x" }))).toMatchObject({ reason: "wrong_reference" }));
  it("rejects wrong currency", () => expect(d(order(), status({ currency: "USD" }))).toMatchObject({ reason: "wrong_currency" }));
  it("rejects wrong amount", () => expect(d(order(), status({ amountCents: 135319 }))).toMatchObject({ reason: "wrong_amount" }));
  it("rejects non-terminal success", () => expect(d(order(), status({ isTerminal: false }))).toMatchObject({ reason: "not_terminal" }));
  it.each(["processing", "failed", "canceled", "expired"])("%s updates status only", (st) => {
    expect(d(order(), status({ status: st }))).toEqual({ action: "update_status", paymentStatus: st, providerStatus: st });
  });
  it("treats an already-paid order as duplicate", () => expect(d(order({ payment_status: "paid" })).action).toBe("duplicate"));
});

function deps(over: Partial<ReconcileDeps> = {}, o = order(), s = status()) {
  let current = { ...o };
  const d: ReconcileDeps & { applied: number } = {
    applied: 0,
    getStatus: vi.fn(async () => s),
    findOrderByPaymentId: vi.fn(async (id) => (id === current.provider_reference ? { ...current } : null)),
    claimForActivation: vi.fn(async () => {
      if (current.payment_status !== "created" && current.payment_status !== "processing") return false;
      current.payment_status = "activating";
      return true;
    }),
    releaseClaim: vi.fn(async (_id, back) => void (current.payment_status = back)),
    updateStatus: vi.fn(async (_id, ps) => void (current.payment_status = ps)),
    recordRejection: vi.fn(async () => {}),
    applyPaidOrder: vi.fn(async () => {
      d.applied++;
      current.payment_status = "paid";
      return { applied: true };
    }),
    now: () => new Date("2026-10-06T00:00:00Z"),
    ...over,
  };
  return d;
}

describe("reconcileWamPayment", () => {
  it("activates a verified succeeded payment via applyPaidOrder with provider wam", async () => {
    const d = deps();
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r).toMatchObject({ httpStatus: 200, outcome: "activated", accessChanged: true });
    expect(d.applyPaidOrder).toHaveBeenCalledWith("order-1", expect.objectContaining({ provider: "wam", capturedCurrency: "TTD", capturedAmount: 1353.2 }));
  });
  it("duplicate succeeded webhook never activates twice", async () => {
    const d = deps();
    await reconcileWamPayment(d, { paymentId: "pay-1" });
    const r2 = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r2.outcome).toBe("already_paid");
    expect(d.applied).toBe(1);
  });
  it.each([
    [status({ currency: "USD" }), "rejected_wrong_currency"],
    [status({ amountCents: 1 }), "rejected_wrong_amount"],
    [status({ merchantReference: "evil" }), "rejected_wrong_reference"],
  ])("mismatch fails closed", async (s, outcome) => {
    const d = deps({}, order(), s);
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r).toMatchObject({ httpStatus: 200, outcome, accessChanged: false });
    expect(d.applyPaidOrder).not.toHaveBeenCalled();
  });
  it("wrong provider order never activates", async () => {
    const d = deps({}, order({ payment_provider: "paypal" }));
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r.outcome).toBe("rejected_wrong_provider");
    expect(d.applyPaidOrder).not.toHaveBeenCalled();
  });
  it.each(["processing", "failed", "canceled", "expired"])("%s never activates", async (st) => {
    const d = deps({}, order(), status({ status: st, isTerminal: st !== "processing" }));
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r).toMatchObject({ httpStatus: 200, accessChanged: false });
    expect(d.updateStatus).toHaveBeenCalledWith("order-1", st, st);
    expect(d.applyPaidOrder).not.toHaveBeenCalled();
  });
  it("unknown payment id is retryable and never activates", async () => {
    const d = deps();
    const r = await reconcileWamPayment(d, { paymentId: "pay-unknown" });
    expect(r).toMatchObject({ httpStatus: 409, accessChanged: false });
  });
  it("status lookup failure returns 503 for WAM retry", async () => {
    const d = deps({ getStatus: vi.fn(async () => { throw new Error("net"); }) });
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r).toMatchObject({ httpStatus: 503, accessChanged: false });
  });
  it("activation failure releases the claim and returns 500", async () => {
    const d = deps({ applyPaidOrder: vi.fn(async () => { throw new Error("db"); }) });
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r).toMatchObject({ httpStatus: 500, accessChanged: false });
    expect(d.releaseClaim).toHaveBeenCalledWith("order-1", "created");
  });
  it("concurrent activation in progress is retryable, not double-applied", async () => {
    const d = deps({ claimForActivation: vi.fn(async () => false) }, order());
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r.httpStatus).toBe(409);
    expect(d.applyPaidOrder).not.toHaveBeenCalled();
  });
});

describe("return URL cannot activate", () => {
  it("result page and its server fn never import the activation path", async () => {
    const fs = await import("fs");
    for (const f of ["src/routes/payment.wam.result.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/applyPaidOrder|reconcileWamPayment|claimForActivation/);
    }
    const fns = fs.readFileSync("src/lib/wam-checkout.functions.ts", "utf8");
    const statusFn = fns.slice(fns.indexOf("export const getWamOrderStatus"), fns.indexOf("async function assertSuperAdmin"));
    expect(statusFn).not.toMatch(/applyPaidOrder|\.update\(|\.insert\(|\.upsert\(/);
  });
});

describe("manual grant source protection", () => {
  it("external payment providers are not manual sources", () => {
    for (const s of EXTERNAL_PAYMENT_SOURCES) {
      expect(isManualGrantSource(s)).toBe(false);
      expect(MANUAL_GRANT_SOURCES as readonly string[]).not.toContain(s);
    }
    expect(isManualGrantSource("manual_admin")).toBe(true);
  });
});

describe("PayPal backward compatibility", () => {
  it("legacy PayPal activation still plans writes and WAM payment cannot hit a PayPal order", () => {
    const po = {
      id: "o", user_id: "u", plan_id: "pro", billing_period: "yearly", currency: "USD",
      total_amount: 199, addons: [], payment_status: "created", payment_provider: "paypal", paypal_order_id: "PP1",
    };
    const plan = planPaidOrderWrites({ order: po, existing: null, workspaceId: null, payment: paypalVerifiedPayment(po, "CAP1") });
    expect(plan.orderUpdate["paypal_capture_id"]).toBe("CAP1");
    expect(() =>
      planPaidOrderWrites({ order: po, existing: null, workspaceId: null, payment: { ...paypalVerifiedPayment(po, "C"), provider: "wam" } }),
    ).toThrow(PaidOrderProviderMismatch);
  });
});
