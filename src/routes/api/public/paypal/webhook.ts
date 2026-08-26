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

type SubStatus = "pending" | "active" | "cancelled" | "expired";

export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          paypalAccessToken,
          paypalApiBase,
          mapPaypalStatus,
          getPaypalCredentials,
          resolvePlanMapping,
          fetchPaypalSubscription,
        } = await import("@/lib/subscription.server");

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

        if (!subscriptionId) {
          await finish({ applied: false, note: "No subscription reference on event" });
          return Response.json({ ok: true, ignored: type });
        }

        let status: SubStatus | null = null;
        let nextBilling: string | null = event.resource?.billing_info?.next_billing_time ?? null;
        let planId: string | null = event.resource?.plan_id ?? null;

        switch (type) {
          case "BILLING.SUBSCRIPTION.ACTIVATED":
          case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
          case "PAYMENT.SALE.COMPLETED":
            status = "active";
            break;
          case "BILLING.SUBSCRIPTION.CANCELLED":
            status = "cancelled";
            break;
          case "BILLING.SUBSCRIPTION.SUSPENDED":
          case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
          case "PAYMENT.SALE.DENIED":
            status = "pending"; // access suspended until payment succeeds
            break;
          case "BILLING.SUBSCRIPTION.EXPIRED":
            status = "expired";
            break;
          case "BILLING.SUBSCRIPTION.UPDATED":
            status = mapPaypalStatus(event.resource?.status);
            break;
          default:
            await finish({ applied: false, note: `Event type not handled: ${type}` });
            return Response.json({ ok: true, ignored: type });
        }

        // For payment events (and whenever the plan is unknown) re-read the live
        // subscription so status, plan and next billing date are authoritative.
        if (type.startsWith("PAYMENT.SALE") || !planId) {
          const live = await fetchPaypalSubscription(subscriptionId);
          if (live) {
            status = mapPaypalStatus(live.status);
            nextBilling = live.billing_info?.next_billing_time ?? nextBilling;
            planId = live.plan_id ?? planId;
          }
        }

        const mapping = await resolvePlanMapping(planId);

        const { data: existing } = await supabaseAdmin
          .from("subscriptions")
          .select("id, user_id, status, tier")
          .eq("payment_reference", subscriptionId)
          .maybeSingle();

        if (!existing) {
          await finish({
            applied: false,
            new_status: status,
            plan_id: planId,
            note: "No local subscription row matched this PayPal reference",
          });
          return Response.json({ ok: true, event: type, matched: false });
        }

        const update: {
          status: SubStatus;
          tier: number;
          started_at?: string;
          expires_at?: string;
        } = { status, tier: mapping.tier };

        if (status === "active") {
          update.started_at = new Date().toISOString();
          if (nextBilling) update.expires_at = nextBilling;
        } else if ((status === "expired" || status === "cancelled") && nextBilling) {
          update.expires_at = nextBilling;
        }

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(update)
          .eq("id", existing.id);

        if (error) {
          console.error("PayPal webhook DB update failed:", error.message);
          await finish({
            applied: false,
            previous_status: existing.status,
            new_status: status,
            plan_id: planId,
            note: `Update failed: ${error.message}`,
          });
          return new Response("Update failed", { status: 500 });
        }

        await finish({
          applied: true,
          previous_status: existing.status,
          new_status: status,
          plan_id: planId,
          user_id: existing.user_id,
          note: `Tier ${existing.tier} → ${mapping.tier}${mapping.label ? ` (${mapping.label})` : ""}`,
        });

        return Response.json({ ok: true, event: type, status, tier: mapping.tier });
      },
    },
  },
});
