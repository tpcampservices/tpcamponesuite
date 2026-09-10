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



export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { paypalAccessToken, paypalApiBase, getPaypalCredentials } = await import(
          "@/lib/subscription.server"
        );

        const { clientId, clientSecret, webhookId } = await getPaypalCredentials();
        if (!webhookId || !clientId || !clientSecret) {
          console.error("PayPal webhook not configured");
          return new Response("Webhook not configured", { status: 503 });
        }

        const body = await request.text();
        const h = (name: string) => request.headers.get(name) ?? "";

        const token = await paypalAccessToken();
        if (!token) return new Response("Auth failed", { status: 500 });

        // Verify the event signature with PayPal before trusting anything in it.
        const verifyRes = await fetch(
          `${paypalApiBase()}/v1/notifications/verify-webhook-signature`,
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
        const verification = (await verifyRes.json().catch(() => ({}))) as {
          verification_status?: string;
        };
        if (verification.verification_status !== "SUCCESS") {
          console.error("PayPal webhook verification failed", verification.verification_status);
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as WebhookEvent;
        const type = event.event_type ?? "";
        const eventId = event.id ?? `${type}:${event.resource?.id ?? "unknown"}`;
        const subscriptionId =
          event.resource?.id ?? event.resource?.billing_agreement_id ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
            return Response.json({ ok: true, duplicate: true, event: type });
          }
          console.error("Webhook event log insert failed:", claimError.message);
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
            return Response.json({ ok: true, event: type, matched: false });
          }

          if (type === "PAYMENT.CAPTURE.DENIED") {
            await supabaseAdmin
              .from("plan_orders")
              .update({ payment_status: "failed" })
              .eq("id", orderRow.id);
            await finish({ applied: true, user_id: orderRow.user_id, new_status: "failed" });
            return Response.json({ ok: true, event: type, status: "failed" });
          }

          if (type === "PAYMENT.CAPTURE.REFUNDED") {
            await supabaseAdmin
              .from("plan_orders")
              .update({ payment_status: "refunded" })
              .eq("id", orderRow.id);
            await finish({ applied: true, user_id: orderRow.user_id, new_status: "refunded" });
            return Response.json({ ok: true, event: type, status: "refunded" });
          }

          if (type === "CHECKOUT.ORDER.APPROVED") {
            await finish({
              applied: false,
              user_id: orderRow.user_id,
              note: "Order approved — awaiting capture",
            });
            return Response.json({ ok: true, event: type });
          }

          // PAYMENT.CAPTURE.COMPLETED — verify against PayPal, then activate/extend.
          const { getPaypalOrder, applyPaidOrder } = await import("@/lib/access.server");
          const live = await getPaypalOrder(paypalOrderId!);
          if (live.status !== "COMPLETED") {
            await finish({ applied: false, note: `PayPal order status ${live.status}` });
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
          return Response.json({ ok: true, event: type, applied: applied.applied });
        }

        // TP-CAMP no longer uses PayPal recurring billing or Billing Plan IDs.
        // Any legacy subscription event is logged for the audit trail and ignored.
        await finish({
          applied: false,
          note: "Recurring/subscription event ignored — TP-CAMP uses one-time fixed-term orders",
        });
        return Response.json({ ok: true, ignored: type });
      },
    },
  },
});
