import { createFileRoute } from "@tanstack/react-router";

/**
 * Non-secret production SSO self-check. It can only submit a fixed fake ticket,
 * so it cannot redeem a real user ticket or expose/bypass the shared key.
 */
export const Route = createFileRoute("/api/public/sso/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = (process.env["TPCAMP_SSO_KEY"] ?? "")
          .trim()
          .replace(/^["']|["']$/g, "")
          .trim();
        if (!key) {
          return Response.json({
            configured: false,
            key_length_range: "0",
            exchange_authorization_passed: false,
          });
        }

        const origin = new URL(request.url).origin;
        const response = await fetch(`${origin}/api/public/sso/exchange`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tpcamp-key": key,
          },
          body: JSON.stringify({
            ticket: "production-self-check-fake-ticket",
            app_slug: "catalog",
          }),
        });
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const invalidTicket = response.status === 400 && body?.error === "invalid";

        return Response.json(
          {
            configured: true,
            key_length_range:
              key.length < 32 ? "1-31" : key.length < 64 ? "32-63" : key.length < 128 ? "64-127" : "128+",
            exchange_status: response.status,
            exchange_error: typeof body?.error === "string" ? body.error : null,
            exchange_authorization_passed: invalidTicket,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});