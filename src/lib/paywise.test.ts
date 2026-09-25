import { describe, expect, it, vi } from "vitest";
import {
  createPaymentRequest,
  getPaymentStatus,
  paywiseRequestDate,
  readPaywiseConfig,
  PaywiseConfigError,
  redact,
} from "./paywise.server";
import { handleInbound, type EventStore } from "./paywise-events.core";

const env = {
  PAYWISE_ENVIRONMENT: "sandbox",
  PAYWISE_SUBSCRIPTION_KEY: "sub-key-test",
  PAYWISE_BUSINESS_API_KEY: "biz-key-test",
  PAYWISE_IP_ADDRESS: "192.0.2.10", // RFC 5737 documentation address, test only
};

describe("PayWise config", () => {
  it("refuses non-sandbox environments", () => {
    expect(() => readPaywiseConfig({ ...env, PAYWISE_ENVIRONMENT: "live" })).toThrow(PaywiseConfigError);
    expect(() => readPaywiseConfig({ ...env, PAYWISE_ENVIRONMENT: undefined })).toThrow(/sandbox/);
  });
  it("fails clearly when the IP address is missing", () => {
    expect(() => readPaywiseConfig({ ...env, PAYWISE_IP_ADDRESS: "" })).toThrow(/PAYWISE_IP_ADDRESS/);
  });
  it("formats the request date as UTC YYYY-MM-DD HH:mm:ss", () => {
    expect(paywiseRequestDate(new Date("2026-09-25T21:05:09.123Z"))).toBe("2026-09-25 21:05:09");
  });
});

describe("PayWise client", () => {
  it("sends subscription key only in header and api_key only in body", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await createPaymentRequest({ amount: 1 }, { env, fetchImpl: fetchImpl as never, now: new Date("2026-01-01T00:00:00Z") });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://sandbox-api.paywise.co/payments/request?version=2024-10-01");
    expect(headers["PW-subscription-key"]).toBe("sub-key-test");
    expect(headers["PW-origin-country"]).toBe("TT");
    expect(headers["PW-ip-address"]).toBe("192.0.2.10");
    expect(headers["PW-request-date"]).toBe("2026-01-01 00:00:00");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(JSON.stringify(headers)).not.toContain("biz-key-test");
    const body = JSON.parse(String(init.body));
    expect(body.api_key).toBe("biz-key-test");
    expect(String(init.body)).not.toContain("sub-key-test");
  });
  it("status check uses GET on sandbox with no body", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await getPaymentStatus({ transaction_id: "t1" }, { env, fetchImpl: fetchImpl as never });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://sandbox-api.paywise.co/payments/status?version=2024-10-01&transaction_id=t1");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });
  it("redacts credentials", () => {
    const r = JSON.stringify(redact({ api_key: "x", nested: { token: "y", ok: 1 }, card_number: "4111" }));
    expect(r).not.toMatch(/"x"|"y"|4111/);
    expect(r).toContain('"ok":1');
  });
});

function memStore() {
  const rows = new Map<string, Record<string, unknown>>();
  const store: EventStore & { rows: typeof rows; dup: number } = {
    rows,
    dup: 0,
    findOrder: async (r) => (r.onesuiteReference === "known-ref" ? "order-1" : null),
    record: async (row) => {
      const k = `${row.channel}|${row.dedupe_key}`;
      if (rows.has(k)) { store.dup++; return "duplicate"; }
      rows.set(k, row);
      return "inserted";
    },
  };
  return store;
}

describe("notify/callback handling", () => {
  const ev = JSON.stringify({ event_id: "e1", event_type: "payment.completed", transaction_id: "t1", reference: "known-ref", status: "PAID", api_key: "leak" });

  it("logs, matches and redacts", async () => {
    const s = memStore();
    const r = await handleInbound("notify", ev, "application/json", s);
    expect(r.status).toBe(200);
    const row = [...s.rows.values()][0];
    expect(row.plan_order_id).toBe("order-1");
    expect(row.verification_status).toBe("not_verified");
    expect(JSON.stringify(row)).not.toContain("leak");
  });
  it("duplicate delivery is recorded once and still returns 200", async () => {
    const s = memStore();
    await handleInbound("callback", ev, "application/json", s);
    const r = await handleInbound("callback", ev, "application/json", s);
    expect(r.status).toBe(200);
    expect(r.body.duplicate).toBe(true);
    expect(s.rows.size).toBe(1);
    expect(s.dup).toBe(1);
  });
  it("accepts form-encoded bodies", async () => {
    const s = memStore();
    const r = await handleInbound("notify", "transaction_id=t9&status=PAID", "application/x-www-form-urlencoded", s);
    expect(r.status).toBe(200);
    expect([...s.rows.values()][0].processing_status).toBe("unmatched");
  });
  it("rejects malformed and oversize bodies", async () => {
    const s = memStore();
    expect((await handleInbound("notify", "{nope", "application/json", s)).status).toBe(400);
    expect((await handleInbound("notify", "x".repeat(300_000), "application/json", s)).status).toBe(413);
    expect(s.rows.size).toBe(0);
  });
  it("event handling code never references activation or entitlements", async () => {
    const fs = await import("node:fs");
    for (const f of ["src/lib/paywise-events.core.ts", "src/lib/paywise-events.server.ts"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/applyPaidOrder|access_entitlements|refreshEntitlementStatus|from\("subscriptions"\)|from\("plan_orders"\)\.update/);
    }
    const page = fs.readFileSync("src/routes/payment.paywise.success.tsx", "utf8");
    expect(page).not.toMatch(/useServerFn|functions"/);
  });
});
