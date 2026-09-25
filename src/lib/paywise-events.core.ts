// Pure logic for inbound PayWise notify/callback events. No entitlement or activation code here.
import { redact } from "./paywise.server";

export const MAX_EVENT_BYTES = 256 * 1024;
export type Channel = "notify" | "callback";

export type ParsedEvent = {
  eventType: string | null;
  paywiseReference: string | null;
  onesuiteReference: string | null;
  status: string | null;
  eventId: string | null;
  payload: Record<string, unknown>;
};

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
    if (typeof v === "number") return String(v);
  }
  return null;
}

function flatten(o: Record<string, unknown>): Record<string, unknown> {
  const data = o["data"];
  return data && typeof data === "object" && !Array.isArray(data)
    ? { ...(data as Record<string, unknown>), ...o }
    : o;
}

export function parseBody(raw: string, contentType: string): Record<string, unknown> | null {
  const ct = contentType.toLowerCase();
  try {
    if (ct.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function extractEvent(body: Record<string, unknown>): ParsedEvent {
  const f = flatten(body);
  return {
    eventType: pick(f, ["event_type", "eventType", "event", "type"]),
    eventId: pick(f, ["event_id", "eventId", "notification_id", "id"]),
    paywiseReference: pick(f, ["transaction_id", "transactionId", "request_id", "requestId", "payment_id", "paywise_reference"]),
    onesuiteReference: pick(f, ["reference", "merchant_reference", "order_reference", "order_id", "orderId", "external_reference"]),
    status: pick(f, ["status", "payment_status", "transaction_status"]),
    payload: redact(body) as Record<string, unknown>,
  };
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable identity for duplicate detection. */
export async function dedupeKey(e: ParsedEvent, raw: string) {
  if (e.eventId) return `event:${e.eventId}`;
  if (e.paywiseReference) return `txn:${e.paywiseReference}:${e.status ?? ""}:${e.eventType ?? ""}`;
  return `body:${await sha256Hex(raw)}`;
}

export type EventStore = {
  findOrder(ref: { paywiseReference: string | null; onesuiteReference: string | null }): Promise<string | null>;
  /** Inserts; returns "inserted" or "duplicate" (unique channel+dedupe_key). */
  record(row: Record<string, unknown>): Promise<"inserted" | "duplicate">;
};

export type HandleResult = { status: number; body: Record<string, unknown> };

/** Logs an inbound event. Deliberately never activates, extends or changes entitlements. */
export async function handleInbound(
  channel: Channel,
  raw: string,
  contentType: string,
  store: EventStore,
): Promise<HandleResult> {
  if (new TextEncoder().encode(raw).length > MAX_EVENT_BYTES) {
    return { status: 413, body: { received: false, error: "payload_too_large" } };
  }
  const body = parseBody(raw, contentType);
  if (!body) return { status: 400, body: { received: false, error: "unreadable_payload" } };
  const e = extractEvent(body);
  const key = await dedupeKey(e, raw);
  const orderId = await store.findOrder(e).catch(() => null);
  const outcome = await store.record({
    channel,
    environment: "sandbox",
    event_type: e.eventType,
    dedupe_key: key,
    paywise_reference: e.paywiseReference,
    onesuite_reference: e.onesuiteReference,
    plan_order_id: orderId,
    processing_status: orderId ? "logged" : "unmatched",
    verification_status: "not_verified",
    payload: { status: e.status, ...e.payload },
  });
  return { status: 200, body: { received: true, duplicate: outcome === "duplicate" } };
}
