import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleInbound, type Channel, type EventStore } from "./paywise-events.core";

const store: EventStore = {
  async findOrder({ paywiseReference, onesuiteReference }) {
    if (paywiseReference) {
      const { data } = await supabaseAdmin.from("plan_orders").select("id")
        .eq("payment_provider", "paywise").eq("provider_transaction_id", paywiseReference).maybeSingle();
      if (data) return data.id;
    }
    if (onesuiteReference) {
      const { data } = await supabaseAdmin.from("plan_orders").select("id")
        .eq("payment_provider", "paywise").eq("provider_reference", onesuiteReference).maybeSingle();
      if (data) return data.id;
    }
    return null;
  },
  async record(row) {
    const { error } = await supabaseAdmin.from("paywise_events").insert(row as never);
    if (!error) return "inserted";
    if (error.code !== "23505") throw new Error(error.message);
    const { data: existing } = await supabaseAdmin.from("paywise_events").select("id, duplicate_count")
      .eq("channel", row.channel as string).eq("dedupe_key", row.dedupe_key as string).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("paywise_events")
        .update({ duplicate_count: existing.duplicate_count + 1, last_duplicate_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return "duplicate";
  },
};

export async function handlePaywiseRequest(channel: Channel, request: Request): Promise<Response> {
  try {
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > 256 * 1024) return Response.json({ received: false, error: "payload_too_large" }, { status: 413 });
    const raw = await request.text();
    const r = await handleInbound(channel, raw, request.headers.get("content-type") ?? "", store);
    return Response.json(r.body, { status: r.status });
  } catch (err) {
    console.error(`PayWise ${channel} processing error`, err instanceof Error ? err.message : "unknown");
    return Response.json({ received: false, error: "processing_error" }, { status: 500 });
  }
}
