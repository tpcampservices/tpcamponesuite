import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_PREP_FAILED,
  CHECKOUT_RETRY,
  CHECKOUT_UNAVAILABLE,
  runWamCheckout,
  type CheckoutDeps,
  type CheckoutOrderRow,
} from "./wam-checkout-run";
import { WAM_RESULT_LABELS, WAM_STALE_CLAIM_MS, WAM_TERMINAL_STATUSES } from "./wam-checkout.core";
import { reconcileWamPayment, type ReconcileDeps } from "./wam-reconcile";

const sel = { planId: "pro", billingPeriod: "monthly", addons: [] } as never;

function mkDeps(over: Partial<CheckoutDeps> = {}) {
  const orders: CheckoutOrderRow[] = [];
  let n = 0;
  const d: CheckoutDeps & { orders: CheckoutOrderRow[] } = {
    orders,
    isStagingTester: vi.fn(async () => true),
    readRate: vi.fn(async () => "6.80"),
    workspaceId: vi.fn(async () => "ws-1"),
    sha256: (t) => `h:${t.length}:${t}`,
    findCandidates: vi.fn(async (fp) => orders.filter((o) => o.quote_fingerprint === fp)),
    insertOrder: vi.fn(async (row) => {
      const o: CheckoutOrderRow = {
        id: String(row.id), payment_provider: "wam", payment_status: "created",
        quote_fingerprint: String(row.quote_fingerprint), created_at: new Date("2026-10-10T00:00:00Z").toISOString(),
        payment_amount_cents: Number(row.payment_amount_cents), merchant_reference: String(row.merchant_reference),
        provider_reference: null,
      };
      orders.push(o);
      return o;
    }),
    createIntent: vi.fn(async (i) => ({ paymentId: `pay-${i.idempotencyKey}`, checkoutUrl: "https://staging.wam/pay", amountCents: i.amountCents, currency: "TTD", status: "created" })),
    markOrder: vi.fn(async (id, patch) => {
      const o = orders.find((x) => x.id === id);
      if (o) Object.assign(o, patch);
    }),
    newId: () => `00000000-0000-0000-0000-00000000000${++n}`,
    now: () => new Date("2026-10-10T00:05:00Z"),
    origin: "https://tpcamponesuite.app",
    userId: "user-1",
    ...over,
  };
  return d;
}

describe("runWamCheckout", () => {
  it("refuses non-staging-testers before any write", async () => {
    const d = mkDeps({ isStagingTester: vi.fn(async () => false) });
    await expect(runWamCheckout(d, sel)).rejects.toThrow(CHECKOUT_UNAVAILABLE);
    expect(d.insertOrder).not.toHaveBeenCalled();
    expect(d.createIntent).not.toHaveBeenCalled();
  });
  it("fails closed with no rate, writing nothing", async () => {
    const d = mkDeps({ readRate: vi.fn(async () => null) });
    await expect(runWamCheckout(d, sel)).rejects.toThrow();
    expect(d.insertOrder).not.toHaveBeenCalled();
  });
  it("prices from the server in USD and locks TTD at the rate", async () => {
    const d = mkDeps();
    const r = await runWamCheckout(d, sel);
    expect(Number(r.exchangeRate)).toBe(6.8);
    expect(r.ttdAmountCents).toBe(Math.round(r.usdTotal * 100 * 6.8));
    const row = vi.mocked(d.insertOrder).mock.calls[0][0];
    expect(row).toMatchObject({ currency: "USD", payment_currency: "TTD", payment_provider: "wam", payment_status: "created" });
  });
  it("reuses the same order and same WAM intent for an identical quote", async () => {
    const d = mkDeps();
    const a = await runWamCheckout(d, sel);
    const b = await runWamCheckout(d, sel);
    expect(b.orderId).toBe(a.orderId);
    expect(d.insertOrder).toHaveBeenCalledTimes(1);
    const keys = vi.mocked(d.createIntent).mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });
  it("a changed rate creates a new order", async () => {
    const d = mkDeps();
    const a = await runWamCheckout(d, sel);
    vi.mocked(d.readRate).mockResolvedValue("6.90");
    const b = await runWamCheckout(d, sel);
    expect(b.orderId).not.toBe(a.orderId);
  });
  it("WAM request failure keeps the order reusable and retry uses the same key", async () => {
    const d = mkDeps();
    vi.mocked(d.createIntent).mockRejectedValueOnce(new Error("net"));
    await expect(runWamCheckout(d, sel)).rejects.toThrow(CHECKOUT_RETRY);
    expect(d.orders[0].payment_status).toBe("created");
    const r = await runWamCheckout(d, sel);
    expect(r.orderId).toBe(d.orders[0].id);
    expect(d.insertOrder).toHaveBeenCalledTimes(1);
  });
  it("amount/currency mismatch from WAM marks the order failed", async () => {
    const d = mkDeps({ createIntent: vi.fn(async (i) => ({ paymentId: "p", checkoutUrl: "https://x", amountCents: i.amountCents + 1, currency: "TTD", status: "created" })) });
    await expect(runWamCheckout(d, sel)).rejects.toThrow(CHECKOUT_PREP_FAILED);
    expect(d.orders[0].payment_status).toBe("failed");
  });
  it("rejects a non-https checkout URL", async () => {
    const d = mkDeps({ createIntent: vi.fn(async (i) => ({ paymentId: "p", checkoutUrl: "http://x", amountCents: i.amountCents, currency: "TTD", status: "created" })) });
    await expect(runWamCheckout(d, sel)).rejects.toThrow(CHECKOUT_PREP_FAILED);
  });
});

describe("stale activation recovery", () => {
  it("stale window is 5 minutes", () => expect(WAM_STALE_CLAIM_MS).toBe(300_000));
  it("server claim reclaims only stale activating orders", () => {
    const src = readFileSync("src/lib/wam-reconcile.server.ts", "utf8");
    expect(src).toMatch(/payment_status\.eq\.activating,updated_at\.lt\./);
    expect(src).toMatch(/created,processing/);
  });
  it("a reclaimed order whose apply is a no-op does not change access", async () => {
    const d: ReconcileDeps = {
      getStatus: vi.fn(async () => ({ paymentId: "pay-1", status: "succeeded", isTerminal: true, amountCents: 100, currency: "TTD", merchantReference: "ref", providerTransactionId: "t", completedAt: null }) as never),
      findOrderByPaymentId: vi.fn(async () => ({ id: "o", payment_provider: "wam", payment_status: "activating", provider_reference: "pay-1", payment_amount_cents: 100, payment_currency: "TTD", merchant_reference: "ref" }) as never),
      claimForActivation: vi.fn(async () => true),
      releaseClaim: vi.fn(), updateStatus: vi.fn(), recordRejection: vi.fn(),
      applyPaidOrder: vi.fn(async () => ({ applied: false })),
      now: () => new Date(),
    };
    const r = await reconcileWamPayment(d, { paymentId: "pay-1" });
    expect(r.accessChanged).toBe(false);
  });
  it("recovery action is Super Admin-gated and re-checks WAM", () => {
    const src = readFileSync("src/lib/wam-checkout.functions.ts", "utf8");
    const block = src.slice(src.indexOf("export const recoverWamOrder"));
    expect(block).toMatch(/assertSuperAdmin\(context\)/);
    expect(block).toMatch(/reconcileWamPayment/);
  });
});

describe("result page is passive", () => {
  it("labels every order state", () => {
    for (const s of ["created", "processing", "activating", ...WAM_TERMINAL_STATUSES]) {
      expect(WAM_RESULT_LABELS[s]).toBeTruthy();
    }
  });
  it("status lookup is scoped to the signed-in user and read-only", () => {
    const src = readFileSync("src/lib/wam-checkout.functions.ts", "utf8");
    const start = src.indexOf("export const getWamOrderStatus");
    const block = src.slice(start, src.indexOf("});", start));
    expect(block).toMatch(/requireSupabaseAuth/);
    expect(block).toMatch(/\.eq\("user_id", context\.userId\)/);
    expect(block).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(/);
    expect(block).not.toMatch(/applyPaidOrder/);
  });
  it("result route never imports activation code", () => {
    const src = readFileSync("src/routes/payment.wam.result.tsx", "utf8");
    expect(src).not.toMatch(/applyPaidOrder|paid-order|reconcile/);
  });
});
