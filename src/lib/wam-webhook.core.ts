// Pure WAM webhook decision logic. No I/O, no database access, no secrets.
// Phase 1A: the receiver verifies and acknowledges only. It never activates
// access, never calls applyPaidOrder() and never marks an order paid.

/** The only WAM events this phase prepares for. */
export const WAM_SUPPORTED_EVENT_TYPES = [
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.failed",
  "payment_intent.canceled",
  "payment_intent.expired",
] as const;

export type WamSupportedEventType = (typeof WAM_SUPPORTED_EVENT_TYPES)[number];

export function isSupportedWamEventType(type: unknown): type is WamSupportedEventType {
  return (
    typeof type === "string" &&
    (WAM_SUPPORTED_EVENT_TYPES as readonly string[]).includes(type)
  );
}

export type WamWebhookOutcome =
  /** WAM_WEBHOOK_SECRET is not configured yet — fail closed. */
  | "secret_not_configured"
  /** Signature or timestamp header absent. */
  | "missing_signature_headers"
  /** Signature/timestamp rejected by WAM's own verification helper. */
  | "invalid_signature"
  /** Verified, but not a payment_intent.* event handled in this phase. */
  | "event_not_handled"
  /** Verified and in scope. Recorded only; no payment or access change. */
  | "verified_acknowledged";

export type WamWebhookResult = {
  outcome: WamWebhookOutcome;
  status: number;
  /** Event type, only when a verified event was parsed. */
  eventType: string | null;
  /** Event id, only when a verified event was parsed. */
  eventId: string | null;
  /** Always false in Phase 1A. The receiver never activates access. */
  accessChanged: false;
};

/** Verifies a WAM signature and returns the parsed event, or throws. */
export type WamWebhookVerifier = (params: {
  payload: string;
  signature: string;
  timestamp: string;
  secret: string;
}) => { id?: string; type?: string; data?: unknown };

export type WamWebhookInput = {
  /** Exact raw request body bytes as received, unparsed. */
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  /** Server-side WAM_WEBHOOK_SECRET, or null/empty when unconfigured. */
  secret: string | null;
  verify: WamWebhookVerifier;
};

/**
 * Decides what to do with one inbound WAM webhook delivery.
 *
 * Fails closed: without a configured signing secret, or without a valid
 * signature, the payload is never trusted and nothing downstream runs.
 */
export function evaluateWamWebhook(input: WamWebhookInput): WamWebhookResult {
  const base = { eventType: null, eventId: null, accessChanged: false } as const;

  const secret = (input.secret ?? "").trim();
  if (!secret) {
    return { ...base, outcome: "secret_not_configured", status: 503 };
  }

  const signature = (input.signature ?? "").trim();
  const timestamp = (input.timestamp ?? "").trim();
  if (!signature || !timestamp) {
    return { ...base, outcome: "missing_signature_headers", status: 400 };
  }

  let event: { id?: string; type?: string };
  try {
    event = input.verify({ payload: input.rawBody, signature, timestamp, secret });
  } catch {
    return { ...base, outcome: "invalid_signature", status: 401 };
  }

  const eventType = typeof event?.type === "string" ? event.type : null;
  const eventId = typeof event?.id === "string" ? event.id : null;

  if (!isSupportedWamEventType(eventType)) {
    return {
      outcome: "event_not_handled",
      status: 202,
      eventType,
      eventId,
      accessChanged: false,
    };
  }

  return {
    outcome: "verified_acknowledged",
    status: 202,
    eventType,
    eventId,
    accessChanged: false,
  };
}
