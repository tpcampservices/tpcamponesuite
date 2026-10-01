// Public WAM webhook receiver — Phase 1A (staging only).
//
// This endpoint exists so the WAM webhook URL can be registered. It verifies
// deliveries with WAM's official signature helper and acknowledges them.
// It never activates access, never calls applyPaidOrder() and never marks an
// order paid. Without WAM_WEBHOOK_SECRET it fails closed with 503.

import { createFileRoute } from "@tanstack/react-router";

const METHOD_NOT_ALLOWED = () =>
  new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });

export const Route = createFileRoute("/api/public/payments/wam/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { evaluateWamWebhook } = await import("@/lib/wam-webhook.core");
        const {
          readWamWebhookSecret,
          verifyWamWebhook,
          WAM_SIGNATURE_HEADER,
          WAM_TIMESTAMP_HEADER,
        } = await import("@/lib/wam.server");

        // Preserve the exact raw body so HMAC verification sees what WAM signed.
        const rawBody = await request.text();

        const result = evaluateWamWebhook({
          rawBody,
          signature: request.headers.get(WAM_SIGNATURE_HEADER),
          timestamp: request.headers.get(WAM_TIMESTAMP_HEADER),
          secret: readWamWebhookSecret(),
          verify: verifyWamWebhook,
        });

        // Diagnostics only: event identifiers, never payload contents or secrets.
        console.info("WAM webhook delivery", {
          outcome: result.outcome,
          eventType: result.eventType,
          eventId: result.eventId,
          bodyBytes: rawBody.length,
        });

        return Response.json(
          {
            received: true,
            outcome: result.outcome,
            event_type: result.eventType,
            processed: false,
            access_changed: false,
            phase: "1A",
          },
          { status: result.status },
        );
      },
      GET: METHOD_NOT_ALLOWED,
    },
  },
});
