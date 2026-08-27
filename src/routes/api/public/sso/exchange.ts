import { createFileRoute } from "@tanstack/react-router";

/**
 * Single-use SSO ticket exchange used by the five child apps.
 *   POST /api/public/sso/exchange   { "ticket": "...", "app": "finance" }
 * Optional hardening: if TPCAMP_SSO_KEY is set, callers must send x-tpcamp-key.
 * Fails closed; a ticket can only ever be redeemed once.
 */
export const Route = createFileRoute("/api/public/sso/exchange")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/entitlement.server");
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        });
      },
      POST: async ({ request }) => {
        const { corsHeaders, redeemTicket, DENIED } = await import("@/lib/entitlement.server");
        const headers = {
          ...corsHeaders(request.headers.get("origin")),
          "Content-Type": "application/json",
        };

        const sharedKey = process.env["TPCAMP_SSO_KEY"];
        if (sharedKey && request.headers.get("x-tpcamp-key") !== sharedKey) {
          return new Response(JSON.stringify(DENIED), { status: 401, headers });
        }

        try {
          const body = (await request.json()) as { ticket?: unknown; app?: unknown };
          const ticket = typeof body.ticket === "string" ? body.ticket : "";
          const app = typeof body.app === "string" ? body.app : undefined;

          const result = await redeemTicket(ticket, app);
          if (!result) {
            return new Response(JSON.stringify(DENIED), { status: 401, headers });
          }
          return new Response(
            JSON.stringify({ ...result.entitlement, app_slug: result.app_slug }),
            { status: 200, headers },
          );
        } catch (err) {
          console.error("SSO exchange failed:", err);
          return new Response(JSON.stringify(DENIED), { status: 500, headers });
        }
      },
    },
  },
});
