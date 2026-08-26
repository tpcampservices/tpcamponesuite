import { createFileRoute } from "@tanstack/react-router";

type WebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    billing_agreement_id?: string;
    billing_info?: { next_billing_time?: string };
  };
};

export const Route = createFileRoute("/api/public/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        const clientId = process.env.PAYPAL_CLIENT_ID;
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        if (!webhookId || !clientId || !clientSecret) {
          console.error("PayPal webhook not configured");
          return new Response("Webhook not configured", { status: 503 });
        }

        const body = await request.text();
        const h = (name: string) => request.headers.get(name) ?? "";

        const {
          paypalAccessToken,
          paypalApiBase,
          mapPaypalStatus,
        } = await import("@/lib/subscription.server");

        const token = await paypalAccessToken();
        if (!token) return new Response("Auth failed", { status: 500 });

        // Verify the event signature with PayPal before trusting anything in it.
        const verifyRes = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
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
        });
        const verification = (await verifyRes.json().catch(() => ({}))) as {
          verification_status?: string;
        };
        if (verification.verification_status !== "SUCCESS") {
          console.error("PayPal webhook verification failed", verification.verification_status);
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as WebhookEvent;
        const type = event.event_type ?? "";
        const subscriptionId =
          event.resource?.id ?? event.resource?.billing_agreement_id ?? null;
        if (!subscriptionId) return Response.json({ ok: true, ignored: type });

        let status: "pending" | "active" | "cancelled" | "expired" | null = null;
        let nextBilling: string | null = event.resource?.billing_info?.next_billing_time ?? null;

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
            return Response.json({ ok: true, ignored: type });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // For payment events, re-read the live subscription to get the true state.
        if (type.startsWith("PAYMENT.SALE")) {
          const { fetchPaypalSubscription } = await import("@/lib/subscription.server");
          const live = await fetchPaypalSubscription(subscriptionId);
          if (live) {
            status = mapPaypalStatus(live.status);
            nextBilling = live.billing_info?.next_billing_time ?? nextBilling;
          }
        }

        const update: Record<string, unknown> = { status };
        if (status === "active") {
          update.started_at = new Date().toISOString();
          if (nextBilling) update.expires_at = nextBilling;
        } else if (status === "expired" || status === "cancelled") {
          if (nextBilling) update.expires_at = nextBilling;
        }

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(update)
          .eq("payment_reference", subscriptionId);

        if (error) {
          console.error("PayPal webhook DB update failed:", error.message);
          return new Response("Update failed", { status: 500 });
        }

        return Response.json({ ok: true, event: type, status });
      },
    },
  },
});
