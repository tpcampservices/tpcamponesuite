import { describe, expect, it } from "vitest";
import {
  PaidOrderProviderMismatch,
  paypalVerifiedPayment,
  planPaidOrderWrites,
  type VerifiedPayment,
} from "./paid-order.core";
import { SUBSCRIPTION_SOURCES } from "./entitlement-model";

const NOW = new Date("2026-10-05T00:00:00.000Z");

function order(over: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    user_id: "user-1",
    plan_id: "pro",
    billing_period: "yearly",
    currency: "USD",
    total_amount: 199,
    addons: [{ id: "team_add", quantity: 2 }],
    payment_status: "created",
    payment_provider: "paypal",
    paypal_order_id: "PP-ORDER-1",
    ...over,
  } as never;
}

const wamPayment: VerifiedPayment = {
  provider: "wam",
  providerReference: "pi_wam_1",
  providerTransactionId: "txn_wam_1",
  providerStatus: "succeeded",
  verifiedAt: NOW.toISOString(),
  capturedAmount: 199,
  capturedCurrency: "USD",
  capturedAt: NOW.toISOString(),
  captureStatus: "succeeded",
};

describe("PayPal through the shared activation path", () => {
  it("legacy capture id maps to provider paypal and keeps PayPal columns", () => {
    const o = order();
    const p = planPaidOrderWrites({
      order: o,
      existing: null,
      workspaceId: "ws-1",
      payment: paypalVerifiedPayment(o, "CAP-1", NOW),
      now: NOW,
    });
    expect(p.entitlement.subscription_source).toBe("paypal");
    expect(p.subscription.payment_provider).toBe("paypal");
    expect(p.subscription.payment_reference).toBe("PP-ORDER-1");
    expect(p.orderUpdate["paypal_capture_id"]).toBe("CAP-1");
    expect(p.orderUpdate["provider_transaction_id"]).toBe("CAP-1");
    // Capture facts written earlier by the PayPal capture step are not overwritten.
    expect("captured_amount" in p.orderUpdate).toBe(false);
    expect(p.entitlement.seats_extra).toBe(2);
    expect(p.entitlement.workspace_id).toBe("ws-1");
    expect(p.expiry).toBe("2027-10-05T00:00:00.000Z");
  });

  it("historical orders without payment_provider are treated as PayPal", () => {
    const o = order({ payment_provider: null });
    const p = planPaidOrderWrites({ order: o, existing: null, workspaceId: null, payment: paypalVerifiedPayment(o, null, NOW), now: NOW });
    expect(p.entitlement.subscription_source).toBe("paypal");
  });
});

describe("hypothetical verified WAM payment", () => {
  it("is represented as provider wam with full metadata", () => {
    const p = planPaidOrderWrites({ order: order({ payment_provider: "wam", paypal_order_id: null }), existing: null, workspaceId: "ws-1", payment: wamPayment, now: NOW });
    expect(p.entitlement.subscription_source).toBe("wam");
    expect(p.subscription.payment_provider).toBe("wam");
    expect(p.subscription.payment_reference).toBe("pi_wam_1");
    expect(p.orderUpdate).toMatchObject({
      payment_status: "paid",
      provider_reference: "pi_wam_1",
      provider_transaction_id: "txn_wam_1",
      provider_status: "succeeded",
      provider_verified_at: NOW.toISOString(),
      captured_amount: 199,
      captured_currency: "USD",
      captured_at: NOW.toISOString(),
      capture_status: "succeeded",
    });
    expect("paypal_capture_id" in p.orderUpdate).toBe(false);
    expect(SUBSCRIPTION_SOURCES).toContain("wam");
  });

  it("cannot be recorded against a PayPal order", () => {
    expect(() =>
      planPaidOrderWrites({ order: order(), existing: null, workspaceId: null, payment: wamPayment, now: NOW }),
    ).toThrow(PaidOrderProviderMismatch);
  });

  it("a PayPal payment cannot be recorded against a WAM order", () => {
    const o = order({ payment_provider: "wam" });
    expect(() =>
      planPaidOrderWrites({ order: o, existing: null, workspaceId: null, payment: paypalVerifiedPayment(o, "CAP", NOW), now: NOW }),
    ).toThrow(PaidOrderProviderMismatch);
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      planPaidOrderWrites({ order: order(), existing: null, workspaceId: null, payment: { ...wamPayment, provider: "stripe" as never }, now: NOW }),
    ).toThrow();
  });
});

describe("renewal behaviour", () => {
  it("early renewal stacks on the unused remainder and keeps the start date", () => {
    const p = planPaidOrderWrites({
      order: order({ payment_provider: "wam", billing_period: "monthly" }),
      existing: { access_start_date: "2026-01-01T00:00:00.000Z", access_expiry_date: "2026-11-01T00:00:00.000Z" },
      workspaceId: null,
      payment: wamPayment,
      now: NOW,
    });
    expect(p.start).toBe("2026-01-01T00:00:00.000Z");
    expect(p.expiry).toBe("2026-12-01T00:00:00.000Z");
  });

  it("lapsed access restarts from now", () => {
    const p = planPaidOrderWrites({
      order: order({ billing_period: "monthly" }),
      existing: { access_start_date: "2025-01-01T00:00:00.000Z", access_expiry_date: "2025-02-01T00:00:00.000Z" },
      workspaceId: null,
      payment: paypalVerifiedPayment(order(), "C", NOW),
      now: NOW,
    });
    expect(p.start).toBe(NOW.toISOString());
    expect(p.expiry).toBe("2026-11-05T00:00:00.000Z");
  });
});

describe("idempotency and wiring", () => {
  it("applyPaidOrder short-circuits paid orders before planning writes", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/lib/access.server.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function applyPaidOrder"));
    expect(fn.indexOf('payment_status === "paid"')).toBeGreaterThan(-1);
    expect(fn.indexOf('payment_status === "paid"')).toBeLessThan(fn.indexOf("planPaidOrderWrites("));
    expect(fn).not.toMatch(/subscription_source:\s*"paypal"|payment_provider:\s*"paypal"/);
  });

  it("WAM webhook is still not connected to activation", async () => {
    const fs = await import("node:fs");
    for (const f of ["src/lib/wam-webhook.core.ts", "src/routes/api/public/payments/wam/webhook.ts"]) {
      const src = fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(src).not.toMatch(/applyPaidOrder|planPaidOrderWrites/);
    }
  });
});
