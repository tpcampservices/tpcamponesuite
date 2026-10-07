// Real dependencies for WAM reconciliation. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ReconcileDeps } from "./wam-reconcile";
import { createWamClient } from "./wam.server";

const ORDER_COLS =
  "id, payment_provider, payment_status, provider_reference, merchant_reference, payment_currency, payment_amount_cents";

export function realReconcileDeps(): ReconcileDeps {
  return {
    async getStatus(paymentId) {
      const s = await createWamClient().getPaymentIntentStatus(paymentId);
      return {
        paymentId: s.paymentId,
        status: String(s.status),
        amountCents: s.amountCents,
        currency: s.currency,
        merchantReference: s.merchantReference,
        providerTransactionId: s.providerTransactionId,
        completedAt: s.completedAt,
        isTerminal: s.isTerminal,
      };
    },
    async findOrderByPaymentId(paymentId) {
      const { data, error } = await supabaseAdmin
        .from("plan_orders")
        .select(ORDER_COLS)
        .eq("payment_provider", "wam")
        .eq("provider_reference", paymentId)
        .maybeSingle();
      if (error) throw new Error("order_lookup_failed");
      return data;
    },
    async claimForActivation(orderId) {
      const { data, error } = await supabaseAdmin
        .from("plan_orders")
        .update({ payment_status: "activating" })
        .eq("id", orderId)
        .eq("payment_provider", "wam")
        .in("payment_status", ["created", "processing"])
        .select("id");
      if (error) throw new Error("claim_failed");
      return (data ?? []).length === 1;
    },
    async releaseClaim(orderId, backTo) {
      await supabaseAdmin
        .from("plan_orders")
        .update({ payment_status: backTo, last_error: "activation_failed" })
        .eq("id", orderId)
        .eq("payment_status", "activating");
    },
    async updateStatus(orderId, paymentStatus, providerStatus) {
      // Never downgrade a paid or activating order.
      await supabaseAdmin
        .from("plan_orders")
        .update({ payment_status: paymentStatus, provider_status: providerStatus })
        .eq("id", orderId)
        .in("payment_status", ["created", "processing"]);
    },
    async recordRejection(orderId, reason) {
      await supabaseAdmin
        .from("plan_orders")
        .update({ last_error: `wam_reconcile_rejected:${reason}` })
        .eq("id", orderId);
    },
    async applyPaidOrder(orderId, payment) {
      const { applyPaidOrder } = await import("./access.server");
      const res = await applyPaidOrder(orderId, payment);
      return { applied: res.applied };
    },
    now: () => new Date(),
  };
}

/** Durable, idempotent record of a verified delivery (counts redeliveries). */
export async function recordWamEvent(e: {
  eventId: string;
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
  outcome: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("wam_events")
    .select("id, delivery_count")
    .eq("event_id", e.eventId)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("wam_events")
      .update({
        delivery_count: existing.delivery_count + 1,
        last_received_at: new Date().toISOString(),
        outcome: e.outcome,
        plan_order_id: e.orderId,
      })
      .eq("id", existing.id);
    return;
  }
  await supabaseAdmin.from("wam_events").insert({
    event_id: e.eventId,
    event_type: e.eventType,
    payment_id: e.paymentId,
    plan_order_id: e.orderId,
    outcome: e.outcome,
  });
}
