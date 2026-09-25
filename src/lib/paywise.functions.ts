import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super Admin PayWise sandbox diagnostics. Secrets are reported as present/absent only. */
export const listPaywiseEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!ok) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PAYWISE_SECRET_NAMES } = await import("./paywise.server");
    const { data, error } = await supabaseAdmin
      .from("paywise_events")
      .select("id, channel, environment, event_type, paywise_reference, onesuite_reference, plan_order_id, processing_status, verification_status, duplicate_count, last_duplicate_at, error_message, payload, received_at")
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return {
      events: (data ?? []).map((e) => ({ ...e, payload: JSON.stringify(e.payload ?? null) })),
      config: PAYWISE_SECRET_NAMES.map((name) => ({ name, present: Boolean((process.env[name] ?? "").trim()) })),
      environment: (process.env["PAYWISE_ENVIRONMENT"] ?? "").trim() || null,
    };
  });
