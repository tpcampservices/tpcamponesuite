import { afterEach, describe, expect, it, vi } from "vitest";
import { WamPaymentError } from "@wamnow/payment-sdk";
import { sanitizeWamIntentError } from "./wam-checkout.core";
import { CHECKOUT_RETRY, runWamCheckout, type CheckoutDeps } from "./wam-checkout-run";

const ORDER = "e97fed29-c0f4-479d-b257-d88b2a8c8cef";
const SECRETS = ["sk_test_SUPERSECRET123", "whsec_ABCDEF", "Bearer eyJhbGciOi.secret.sig", "4111111111111111"];

function poisoned() {
  return new WamPaymentError(`Invalid key ${SECRETS[0]} for card ${SECRETS[3]}`, "API_REQUEST_ERROR", {
    statusCode: 401,
    requestId: "req_abc-123",
    details: { headers: { authorization: SECRETS[2], "x-wam-api-key": SECRETS[0] }, body: { secret: SECRETS[1] } },
  });
}

describe("sanitizeWamIntentError", () => {
  it("keeps only allowlisted fields", () => {
    const d = sanitizeWamIntentError(ORDER, poisoned());
    expect(Object.keys(d).sort()).toEqual(["code", "errorClass", "orderId", "requestId", "statusCode"]);
    expect(d).toMatchObject({ orderId: ORDER, code: "API_REQUEST_ERROR", statusCode: 401, requestId: "req_abc-123" });
  });

  it("never contains credentials, details or provider text", () => {
    const s = JSON.stringify(sanitizeWamIntentError(ORDER, poisoned()));
    for (const secret of SECRETS) expect(s).not.toContain(secret);
    expect(s).not.toMatch(/authorization|details|headers|body|stack/i);
  });

  it("keeps known SDK-generated messages and parses attempts", () => {
    const e = new WamPaymentError("POST /api/public/payment-intents failed with status 503 (after 3 attempts)", "API_REQUEST_ERROR", { statusCode: 503 });
    const d = sanitizeWamIntentError(ORDER, e);
    expect(d.message).toBe("POST /api/public/payment-intents failed with status 503 (after 3 attempts)");
    expect(d.attempts).toBe(3);
  });

  it("omits network messages (may echo host/cause text)", () => {
    const e = new WamPaymentError(`Network request to POST /api/public/payment-intents failed: ${SECRETS[0]}`, "NETWORK_ERROR");
    expect(sanitizeWamIntentError(ORDER, e).message).toBeUndefined();
  });

  it("drops unsafe or oversized request ids and bogus codes/status", () => {
    const e = Object.assign(new Error("x"), { requestId: "a".repeat(65), code: "lower; DROP", statusCode: 9999 });
    const d = sanitizeWamIntentError(ORDER, e);
    expect(d.requestId).toBeUndefined();
    expect(d.code).toBeUndefined();
    expect(d.statusCode).toBeUndefined();
    expect(sanitizeWamIntentError(ORDER, Object.assign(new Error(), { requestId: `id ${SECRETS[2]}` })).requestId).toBeUndefined();
  });

  it("handles non-object throws", () => {
    expect(sanitizeWamIntentError(ORDER, SECRETS[0])).toEqual({ orderId: ORDER, errorClass: "other" });
    expect(sanitizeWamIntentError("not-a-uuid", null).orderId).toBe("invalid");
  });
});

describe("runWamCheckout failure logging", () => {
  afterEach(() => vi.restoreAllMocks());

  function deps(over: Partial<CheckoutDeps> = {}): CheckoutDeps {
    return {
      isStagingTester: async () => true,
      readRate: async () => "6.80",
      workspaceId: async () => "ws",
      sha256: (t) => `fp:${t.length}`,
      findCandidates: async () => [],
      insertOrder: async (row) => ({
        id: ORDER, payment_provider: "wam", payment_status: "created", quote_fingerprint: String(row.quote_fingerprint),
        created_at: new Date().toISOString(), payment_amount_cents: Number(row.payment_amount_cents),
        merchant_reference: String(row.merchant_reference), provider_reference: null,
      }),
      createIntent: async () => { throw poisoned(); },
      markOrder: vi.fn(async () => {}),
      newId: () => ORDER,
      now: () => new Date(),
      origin: "https://tpcamponesuite.app",
      userId: "u1",
      ...over,
    };
  }

  it("logs sanitized diagnostics, preserves message and order state", async () => {
    const logError = vi.fn();
    const d = deps({ logError });
    await expect(runWamCheckout(d, { planId: "starter", billingPeriod: "yearly", addons: [] } as never)).rejects.toThrow(CHECKOUT_RETRY);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toMatchObject({ orderId: ORDER, statusCode: 401, code: "API_REQUEST_ERROR" });
    expect(d.markOrder).toHaveBeenCalledWith(ORDER, { last_error: "wam_intent_request_failed" });
  });

  it("default console logger output contains no secrets", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runWamCheckout(deps(), { planId: "starter", billingPeriod: "yearly", addons: [] } as never)).rejects.toThrow(CHECKOUT_RETRY);
    const out = spy.mock.calls.flat().map(String).join(" ");
    expect(out).toContain(ORDER);
    for (const secret of SECRETS) expect(out).not.toContain(secret);
    expect(out).not.toMatch(/authorization|x-wam-api-key/i);
  });
});
