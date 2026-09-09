import { createFileRoute } from "@tanstack/react-router";

/**
 * Child apps POST here from their own server with the shared TPCAMP_SSO_KEY:
 *   { ticket: string, app_slug: string }
 * Response: { token_hash, email, entitlement }
 * The child app then calls supabase.auth.verifyOtp({ token_hash, type: 'email' })
 * to create a local session for the SAME OneSuite user account.
 */
export const Route = createFileRoute("/api/public/sso/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { childAppAuthorized, redeemTicket } = await import("@/lib/sso.server");
        if (!childAppAuthorized(request)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let body: { ticket?: unknown; app_slug?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const ticket = typeof body.ticket === "string" ? body.ticket : "";
        const appSlug = typeof body.app_slug === "string" ? body.app_slug : "";
        if (!ticket || !appSlug) {
          return Response.json({ error: "missing_fields" }, { status: 400 });
        }

        const result = await redeemTicket(ticket, appSlug);
        if (!result.ok) {
          return Response.json({ error: result.reason }, { status: 400 });
        }

        return Response.json(
          {
            token_hash: result.tokenHash,
            email: result.email,
            entitlement: result.entitlement,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
