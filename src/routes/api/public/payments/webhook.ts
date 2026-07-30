import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook not configured", { status: 503 });
        }

        const body = await request.text();
        const signature = request.headers.get("x-payment-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: { reference?: string; status?: string; expires_at?: string };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const reference = payload.reference;
        if (!reference || typeof reference !== "string") {
          return new Response("Missing reference", { status: 400 });
        }

        const statusMap: Record<string, "active" | "cancelled" | "expired" | "pending"> = {
          paid: "active",
          succeeded: "active",
          completed: "active",
          active: "active",
          failed: "cancelled",
          cancelled: "cancelled",
          refunded: "cancelled",
          expired: "expired",
        };
        const status = statusMap[(payload.status ?? "").toLowerCase()];
        if (!status) {
          return new Response("Unknown status", { status: 400 });
        }

        const oneYear = new Date();
        oneYear.setFullYear(oneYear.getFullYear() + 1);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({
            status,
            started_at: status === "active" ? new Date().toISOString() : null,
            expires_at:
              status === "active"
                ? (payload.expires_at ?? oneYear.toISOString())
                : new Date().toISOString(),
          })
          .eq("payment_reference", reference);

        if (error) {
          console.error("Webhook update failed:", error.message);
          return new Response("Update failed", { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
