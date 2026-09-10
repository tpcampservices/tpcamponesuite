import { createFileRoute } from "@tanstack/react-router";

type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    plan_id?: string;
    billing_agreement_id?: string;
    billing_info?: { next_billing_time?: string };
  };
};

type DiagOutcome =
  | "RECEIVED"
  | "SIGNATURE_VERIFIED"
  | "SIGNATURE_FAILED"
  | "UNKNOWN_PURCHASE"
  | "DUPLICATE_EVENT"
  | "PROCESSED"
  | "REJECTED";

const TRANSMISSION_HEADERS = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
] as const;

export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getPaypalCredentials, requestPaypalToken } = await import(
          "@/lib/subscription.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const body = await request.text();
        const h = (name: string) => request.headers.get(name) ?? "";

        // ---- Diagnostics: record the attempt BEFORE any verification. ----
        // Never log secrets, access tokens or Authorization header values.
        let parsed: WebhookEvent = {};
        try {
          parsed = JSON.parse(body) as WebhookEvent;
        } catch {
          parsed = {};
        }
        const headersPresent = Object.fromEntries(
          TRANSMISSION_HEADERS.map((name) => [name, h(name).length > 0]),
        );
        const debugId = h("paypal-debug-id") || null;

        const { clientId, clientSecret, webhookId, environment } = await getPaypalCredentials();

        const { data: diag } = await supabaseAdmin
          .from("paypal_webhook_diagnostics")
          .insert({
            event_id: parsed.id ?? null,
            event_type: parsed.event_type ?? null,
            environment,
            headers_present: headersPresent,
            outcome: "RECEIVED" as DiagOutcome,
            paypal_debug_id: debugId,
          })
          .select("id")
          .single();
        const diagId = diag?.id as string | undefined;
        const finishDiag = async (fields: {
          outcome: DiagOutcome;
          http_status: number;
          signature_result?: string;
          rejection_reason?: string | null;
          note?: string | null;
          paypal_debug_id?: string | null;
        }) => {
          if (!diagId) return;
          await supabaseAdmin
            .from("paypal_webhook_diagnostics")
            .update(fields)
            .eq("id", diagId);
        };

        if (!webhookId || !clientId || !clientSecret) {
          console.error("PayPal webhook not configured", { environment });
          await finishDiag({
            outcome: "REJECTED",
            http_status: 503,
            rejection_reason: "webhook_not_configured",
            note: `PayPal ${environment} credentials or webhook ID missing`,
          });
          return new Response("Webhook not configured", { status: 503 });
        }

        const tokenResult = await requestPaypalToken(environment);
        if (!tokenResult.ok) {
          await finishDiag({
            outcome: "REJECTED",
            http_status: 500,
            rejection_reason: "paypal_auth_failed",
            paypal_debug_id: tokenResult.debugId,
            note: `OAuth failed (${tokenResult.status ?? "unknown"}): ${tokenResult.error ?? ""} ${tokenResult.message ?? ""}`.trim(),
          });
          return new Response("Auth failed", { status: 500 });
        }
        const token = tokenResult.token;

        // Verify the event signature with PayPal before trusting anything in it.
        const verifyRes = await fetch(
          `${tokenResult.apiBase}/v1/notifications/verify-webhook-signature`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              auth_algo: h("paypal-auth-algo"),
              cert_url: h("paypal-cert-url"),
              transmission_id: h("paypal-transmission-id"),
              transmission_sig: h("paypal-transmission-sig"),
              transmission_time: h("paypal-transmission-time"),
              webhook_id: webhookId,
              webhook_event: JSON.parse(body),
            }),
          },
        );
        const verifyDebugId = verifyRes.headers.get("paypal-debug-id");
        const verification = (await verifyRes.json().catch(() => ({}))) as {
          verification_status?: string;
        };
        if (verification.verification_status !== "SUCCESS") {
          console.error("PayPal webhook verification failed", {
            environment,
            status: verification.verification_status,
            debugId: verifyDebugId,
            eventType: parsed.event_type,
          });
          await finishDiag({
            outcome: "SIGNATURE_FAILED",
            http_status: 401,
            signature_result: verification.verification_status ?? "no_response",
            rejection_reason: "signature_verification_failed",
            paypal_debug_id: verifyDebugId ?? debugId,
            note: "Includes PayPal Webhook Simulator events, which cannot be verified via the live verify-webhook-signature API",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        await finishDiag({ outcome: "SIGNATURE_VERIFIED", http_status: 200, signature_result: "SUCCESS" });

        const event = JSON.parse(body) as WebhookEvent;
        const type = event.event_type ?? "";
        const eventId = event.id ?? `${type}:${event.resource?.id ?? "unknown"}`;
        const subscriptionId =
          event.resource?.id ?? event.resource?.billing_agreement_id ?? null;

        // --- Idempotency: claim this event id first. A duplicate delivery loses the
        // race on the unique index and is logged without touching the subscription.
        const { error: claimError } = await supabaseAdmin
          .from("paypal_webhook_events")
          .insert({
            event_id: eventId,
            event_type: type,
            resource_id: event.resource?.id ?? null,
            subscription_reference: subscriptionId,
            plan_id: event.resource?.plan_id ?? null,
            payload: JSON.parse(body) as never,
          });

        if (claimError) {
          if (claimError.code === "23505") {
            await supabaseAdmin.from("paypal_webhook_events").insert({
              event_id: `${eventId}:dup:${crypto.randomUUID()}`,
              event_type: type,
              resource_id: event.resource?.id ?? null,
              subscription_reference: subscriptionId,
              plan_id: event.resource?.plan_id ?? null,
              duplicate: true,
              applied: false,
              note: "Duplicate delivery ignored (event already processed)",
            });
            await finishDiag({
              outcome: "DUPLICATE_EVENT",
              http_status: 200,
              signature_result: "SUCCESS",
              note: "Duplicate delivery ignored",
            });
            return Response.json({ ok: true, duplicate: true, event: type });
          }
          console.error("Webhook event log insert failed:", claimError.message);
          await finishDiag({
            outcome: "REJECTED",
            http_status: 500,
            signature_result: "SUCCESS",
            rejection_reason: "event_log_insert_failed",
            note: claimError.message,
          });
          return new Response("Log failed", { status: 500 });
        }

        const finish = async (fields: {
          previous_status?: string | null;
          new_status?: string | null;
          applied?: boolean;
          note?: string | null;
          user_id?: string | null;
          plan_id?: string | null;
        }) => {
          await supabaseAdmin
            .from("paypal_webhook_events")
            .update(fields)
            .eq("event_id", eventId);
        };

        // ---- One-time Orders API events (fixed-term manual-renewal access) ----
        if (
          type === "PAYMENT.CAPTURE.COMPLETED" ||
          type === "CHECKOUT.ORDER.APPROVED" ||
          type === "PAYMENT.CAPTURE.DENIED" ||
          type === "PAYMENT.CAPTURE.REFUNDED"
        ) {
          const resource = (JSON.parse(body) as any).resource ?? {};
          const paypalOrderId: string | null =
            resource?.supplementary_data?.related_ids?.order_id ??
            (type === "CHECKOUT.ORDER.APPROVED" ? resource?.id : null);

          const { data: orderRow } = paypalOrderId
            ? await supabaseAdmin
                .from("plan_orders")
                .select("id, user_id, payment_status")
                .eq("paypal_order_id", paypalOrderId)
                .maybeSingle()
            : { data: null as null };

          if (!orderRow) {
            await finish({ applied: false, note: `No local order matched ${paypalOrderId ?? "n/a"}` });
            await finishDiag({
              outcome: "UNKNOWN_PURCHASE",
              http_status: 200,
              signature_result: "SUCCESS",
              note: `No local order matched ${paypalOrderId ?? "n/a"}`,
            });
            return Response.json({ ok: true, event: type, matched: false });
          }

          if (type === "PAYMENT.CAPTURE.DENIED") {
            await supabaseAdmin
              .from("plan_orders")
              .update({ payment_status: "failed" })
              .eq("id", orderRow.id);
            await finish({ applied: true, user_id: orderRow.user_id, new_status: "failed" });
            await finishDiag({ outcome: "PROCESSED", http_status: 200, signature_result: "SUCCESS", note: "Capture denied — order marked failed" });
            return Response.json({ ok: true, event: type, status: "failed" });
          }

          if (type === "PAYMENT.CAPTURE.REFUNDED") {
            await supabaseAdmin
              .from("plan_orders")
              .update({ payment_status: "refunded" })
              .eq("id", orderRow.id);
            await finish({ applied: true, user_id: orderRow.user_id, new_status: "refunded" });
            await finishDiag({ outcome: "PROCESSED", http_status: 200, signature_result: "SUCCESS", note: "Capture refunded — order marked refunded" });
            return Response.json({ ok: true, event: type, status: "refunded" });
          }

          if (type === "CHECKOUT.ORDER.APPROVED") {
            await finish({
              applied: false,
              user_id: orderRow.user_id,
              note: "Order approved — awaiting capture",
            });
            await finishDiag({ outcome: "PROCESSED", http_status: 200, signature_result: "SUCCESS", note: "Order approved — awaiting capture" });
            return Response.json({ ok: true, event: type });
          }

          // PAYMENT.CAPTURE.COMPLETED — verify against PayPal, then activate/extend.
          const { getPaypalOrder, applyPaidOrder } = await import("@/lib/access.server");
          const live = await getPaypalOrder(paypalOrderId!);
          if (live.status !== "COMPLETED") {
            await finish({ applied: false, note: `PayPal order status ${live.status}` });
            await finishDiag({
              outcome: "REJECTED",
              http_status: 200,
              signature_result: "SUCCESS",
              rejection_reason: "order_not_completed",
              note: `PayPal order status ${live.status}`,
            });
            return Response.json({ ok: true, event: type, status: live.status });
          }

          const applied = await applyPaidOrder(orderRow.id, live.captureId ?? resource?.id ?? null);
          await finish({
            applied: applied.applied,
            user_id: orderRow.user_id,
            previous_status: orderRow.payment_status,
            new_status: "paid",
            note: applied.applied
              ? `Access extended to ${applied.expiry}`
              : "Already applied (duplicate payment event ignored)",
          });
          await finishDiag({
            outcome: "PROCESSED",
            http_status: 200,
            signature_result: "SUCCESS",
            note: applied.applied ? `Access extended to ${applied.expiry}` : "Already applied",
          });
          return Response.json({ ok: true, event: type, applied: applied.applied });
        }

        // TP-CAMP no longer uses PayPal recurring billing or Billing Plan IDs.
        // Any legacy subscription event is logged for the audit trail and ignored.
        await finish({
          applied: false,
          note: "Recurring/subscription event ignored — TP-CAMP uses one-time fixed-term orders",
        });
        await finishDiag({
          outcome: "PROCESSED",
          http_status: 200,
          signature_result: "SUCCESS",
          note: `Event ${type} logged and ignored (not a fixed-term order event)`,
        });
        return Response.json({ ok: true, ignored: type });
      },
    },
  },
});
