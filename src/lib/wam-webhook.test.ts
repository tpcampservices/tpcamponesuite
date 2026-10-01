import { describe, expect, it, vi } from "vitest";
import { MockWamPaymentSDK } from "@wamnow/payment-sdk/testing";
import {
  WAM_SUPPORTED_EVENT_TYPES,
  evaluateWamWebhook,
  isSupportedWamEventType,
} from "./wam-webhook.core";
import {
  WAM_ALLOWED_ENVIRONMENTS,
  WamConfigError,
  readWamConfig,
  readWamWebhookSecret,
  verifyWamWebhook,
  wamSecretPresence,
} from "./wam.server";

const SECRET = "whsec_phase1a_test_secret";

function signedDelivery(
  type: string,
  secret = SECRET,
  data: Record<string, unknown> = { paymentId: "pi_test_1", status: "succeeded" },
) {
  const mock = new MockWamPaymentSDK();
  return mock.buildWebhookPayload(secret, { type, data } as never) as {
    body: string;
    signature: string;
    timestamp: string;
  };
}

describe("supported event types", () => {
  it("covers exactly the five payment_intent events for this phase", () => {
    expect([...WAM_SUPPORTED_EVENT_TYPES]).toEqual([
      "payment_intent.processing",
      "payment_intent.succeeded",
      "payment_intent.failed",
      "payment_intent.canceled",
      "payment_intent.expired",
    ]);
  });

  it("rejects out-of-scope event domains", () => {
    for (const type of [
      "subscription.created",
      "subscription.payment.succeeded",
      "charge.succeeded",
      "payment_method.attached",
      "refund.succeeded",
      "pos.payment.succeeded",
      "payment_intent.created",
      "payment_intent.requires_payment_method",
    ]) {
      expect(isSupportedWamEventType(type)).toBe(false);
    }
  });
});

describe("fail-closed behaviour without WAM_WEBHOOK_SECRET", () => {
  it("refuses with 503 and never verifies or processes", () => {
    const verify = vi.fn();
    const delivery = signedDelivery("payment_intent.succeeded");
    const result = evaluateWamWebhook({
      rawBody: delivery.body,
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      secret: null,
      verify,
    });
    expect(result.outcome).toBe("secret_not_configured");
    expect(result.status).toBe(503);
    expect(result.accessChanged).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it("treats a blank secret as unconfigured", () => {
    const result = evaluateWamWebhook({
      rawBody: "{}",
      signature: "sig",
      timestamp: "1",
      secret: "   ",
      verify: () => ({ type: "payment_intent.succeeded" }),
    });
    expect(result.outcome).toBe("secret_not_configured");
    expect(result.status).toBe(503);
  });
});

describe("signature verification", () => {
  it("accepts a correctly signed in-scope event and acknowledges only", () => {
    const delivery = signedDelivery("payment_intent.succeeded");
    const result = evaluateWamWebhook({
      rawBody: delivery.body,
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      secret: SECRET,
      verify: verifyWamWebhook,
    });
    expect(result.outcome).toBe("verified_acknowledged");
    expect(result.status).toBe(202);
    expect(result.eventType).toBe("payment_intent.succeeded");
    expect(result.accessChanged).toBe(false);
  });

  it("accepts each of the five in-scope events", () => {
    for (const type of WAM_SUPPORTED_EVENT_TYPES) {
      const delivery = signedDelivery(type);
      const result = evaluateWamWebhook({
        rawBody: delivery.body,
        signature: delivery.signature,
        timestamp: delivery.timestamp,
        secret: SECRET,
        verify: verifyWamWebhook,
      });
      expect(result.outcome).toBe("verified_acknowledged");
      expect(result.accessChanged).toBe(false);
    }
  });

  it("rejects a delivery signed with a different secret", () => {
    const delivery = signedDelivery("payment_intent.succeeded", "whsec_wrong_secret");
    const result = evaluateWamWebhook({
      rawBody: delivery.body,
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      secret: SECRET,
      verify: verifyWamWebhook,
    });
    expect(result.outcome).toBe("invalid_signature");
    expect(result.status).toBe(401);
  });

  it("rejects a tampered body under a valid signature", () => {
    const delivery = signedDelivery("payment_intent.succeeded");
    const result = evaluateWamWebhook({
      rawBody: delivery.body.replace("pi_test_1", "pi_attacker"),
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      secret: SECRET,
      verify: verifyWamWebhook,
    });
    expect(result.outcome).toBe("invalid_signature");
    expect(result.status).toBe(401);
  });

  it("rejects a replayed delivery outside WAM's timestamp tolerance", () => {
    const delivery = signedDelivery("payment_intent.succeeded");
    const stale = String(Number(delivery.timestamp) - 60 * 60 * 24);
    const result = evaluateWamWebhook({
      rawBody: delivery.body,
      signature: delivery.signature,
      timestamp: stale,
      secret: SECRET,
      verify: verifyWamWebhook,
    });
    expect(result.outcome).toBe("invalid_signature");
    expect(result.status).toBe(401);
  });

  it("refuses when signature or timestamp headers are absent", () => {
    const delivery = signedDelivery("payment_intent.succeeded");
    for (const headers of [
      { signature: null, timestamp: delivery.timestamp },
      { signature: delivery.signature, timestamp: null },
      { signature: null, timestamp: null },
    ]) {
      const result = evaluateWamWebhook({
        rawBody: delivery.body,
        secret: SECRET,
        verify: verifyWamWebhook,
        ...headers,
      });
      expect(result.outcome).toBe("missing_signature_headers");
      expect(result.status).toBe(400);
    }
  });
});

describe("out-of-scope verified events", () => {
  it("acknowledges without handling a verified subscription event", () => {
    const delivery = signedDelivery("subscription.payment.succeeded", SECRET, {
      subscriptionId: "sub_1",
    });
    const result = evaluateWamWebhook({
      rawBody: delivery.body,
      signature: delivery.signature,
      timestamp: delivery.timestamp,
      secret: SECRET,
      verify: verifyWamWebhook,
    });
    expect(result.outcome).toBe("event_not_handled");
    expect(result.status).toBe(202);
    expect(result.accessChanged).toBe(false);
  });
});

describe("no activation path in Phase 1A", () => {
  it("never reports an access change for any outcome", () => {
    const cases = [
      { secret: null as string | null, type: "payment_intent.succeeded" },
      { secret: SECRET, type: "payment_intent.succeeded" },
      { secret: SECRET, type: "payment_intent.failed" },
      { secret: SECRET, type: "charge.succeeded" },
    ];
    for (const c of cases) {
      const delivery = signedDelivery(c.type);
      const result = evaluateWamWebhook({
        rawBody: delivery.body,
        signature: delivery.signature,
        timestamp: delivery.timestamp,
        secret: c.secret,
        verify: verifyWamWebhook,
      });
      expect(result.accessChanged).toBe(false);
    }
  });

  it("holds no reference to the paid-order activation path", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/wam-webhook.core.ts", "utf8"),
    );
    expect(source).not.toContain("applyPaidOrder");
    expect(source).not.toContain("supabase");
  });
});

describe("WAM configuration reader", () => {
  it("accepts staging and refuses production in this phase", () => {
    expect([...WAM_ALLOWED_ENVIRONMENTS]).toEqual(["staging", "local"]);
    const env = { WAM_ENVIRONMENT: "staging", WAM_BUSINESS_ID: "b", WAM_API_KEY: "k" };
    expect(readWamConfig(env).environment).toBe("staging");
    expect(() => readWamConfig({ ...env, WAM_ENVIRONMENT: "production" })).toThrow(
      WamConfigError,
    );
  });

  it("names missing variables without revealing values", () => {
    try {
      readWamConfig({ WAM_ENVIRONMENT: "staging", WAM_API_KEY: "supersecret" });
      throw new Error("expected a configuration error");
    } catch (err) {
      expect((err as Error).message).toContain("WAM_BUSINESS_ID");
      expect((err as Error).message).not.toContain("supersecret");
    }
  });

  it("reports presence only, never secret values", () => {
    const presence = wamSecretPresence({
      WAM_BUSINESS_ID: "b",
      WAM_API_KEY: "k",
      WAM_ENVIRONMENT: "staging",
    });
    expect(presence).toEqual({
      WAM_BUSINESS_ID: true,
      WAM_API_KEY: true,
      WAM_ENVIRONMENT: true,
      WAM_WEBHOOK_SECRET: false,
    });
    expect(Object.values(presence).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("returns null for an unset or blank webhook secret", () => {
    expect(readWamWebhookSecret({})).toBeNull();
    expect(readWamWebhookSecret({ WAM_WEBHOOK_SECRET: "  " })).toBeNull();
    expect(readWamWebhookSecret({ WAM_WEBHOOK_SECRET: " abc " })).toBe("abc");
  });
});
