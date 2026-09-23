import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * CRM queue processor, woken by the database (on enqueue + hourly backstop).
 * Caller must present the server-held processor token. Never returns PII.
 */
export const Route = createFileRoute("/api/public/crm/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("integration_settings")
          .select("value")
          .eq("key", "crm_processor_token")
          .maybeSingle();
        const expected = Buffer.from(data?.value ?? "");
        const given = Buffer.from(request.headers.get("x-crm-token") ?? "");
        if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { processCrmQueue } = await import("@/lib/crm-queue.server");
          const summary = await processCrmQueue(10);
          return Response.json(summary, { headers: { "cache-control": "no-store" } });
        } catch (e) {
          console.error("[crm-queue] processor failed", e instanceof Error ? e.message : e);
          return new Response("Processor error", { status: 500 });
        }
      },
    },
  },
});
