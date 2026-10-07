// Public WAM webhook receiver — Phase 2C (staging only).
//
// Pattern A: signature verification, independent status retrieval through the
// official SDK, strict order matching and activation all complete BEFORE a 2xx
// is returned. Transient failures return 5xx/409 so WAM redelivers.

import { createFileRoute } from "@tanstack/react-router";

const METHOD_NOT_ALLOWED = () =>
  new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });

export const Route = createFileRoute("/api/public/payments/wam/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { evaluateWamWebhook } = await import("@/lib/wam-webhook.core");
        const { readWamWebhookSecret, verifyWamWebhook, WAM_SIGNATURE_HEADER, WAM_TIMESTAMP_HEADER } =
          await import("@/lib/wam.server");

        const rawBody = await request.text();
        let parsed: { id?: string; type?: string; data?: { paymentId?: unknown } } = {};
        const result = evaluateWamWebhook({
          rawBody,
          signature: request.headers.get(WAM_SIGNATURE_HEADER),
          timestamp: request.headers.get(WAM_TIMESTAMP_HEADER),
          secret: readWamWebhookSecret(),
          verify: (p) => {
            parsed = verifyWamWebhook(p) as typeof parsed;
            return parsed;
          },
        });

        if (result.outcome !== "verified_acknowledged") {
          console.info("WAM webhook delivery", { outcome: result.outcome, eventType: result.eventType });
          return Response.json(
            { received: true, outcome: result.outcome, processed: false, access_changed: false },
            { status: result.status },
          );
        }

        const { reconcileWamPayment } = await import("@/lib/wam-reconcile");
        const { realReconcileDeps, recordWamEvent } = await import("@/lib/wam-reconcile.server");
        const paymentId = typeof parsed.data?.paymentId === "string" ? parsed.data.paymentId : "";

        let rec;
        try {
          rec = await reconcileWamPayment(realReconcileDeps(), { paymentId });
        } catch {
          rec = { httpStatus: 500, outcome: "reconcile_error", orderId: null, accessChanged: false };
        }
        try {
          await recordWamEvent({
            eventId: result.eventId ?? `noid:${paymentId}`,
            eventType: result.eventType ?? "unknown",
            paymentId: paymentId || null,
            orderId: rec.orderId,
            outcome: rec.outcome,
          });
        } catch {
          // Recording must not convert a completed activation into a retry storm.
        }
        console.info("WAM webhook reconciled", { eventType: result.eventType, outcome: rec.outcome });

        return Response.json(
          { received: true, outcome: rec.outcome, processed: rec.httpStatus === 200, access_changed: rec.accessChanged },
          { status: rec.httpStatus },
        );
      },
      GET: METHOD_NOT_ALLOWED,
    },
  },
});
