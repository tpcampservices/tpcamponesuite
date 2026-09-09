import { createFileRoute } from "@tanstack/react-router";

/**
 * Child apps POST here from their own server with the shared TPCAMP_SSO_KEY:
 *   { ticket: string, app_slug: string }
 * Response: canonical OneSuite identity + entitlement + a short-lived HS256
 * assertion (signed with TPCAMP_SSO_KEY) the child app verifies server-side.
 * Child apps keep their OWN backend and map a local shadow account to
 * canonical_user_id. No shared auth.users required.
 */
export const Route = createFileRoute("/api/public/sso/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { childAppAuth, redeemTicket } = await import("@/lib/sso.server");
        const auth = childAppAuth(request);
        if (!auth.ok) {
          return auth.reason === "not_configured"
            ? Response.json({ error: "sso_key_not_configured" }, { status: 503 })
            : Response.json({ error: "unauthorized" }, { status: 401 });
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
            canonical_user_id: result.canonicalUserId,
            email: result.email,
            name: result.name,
            app_slug: result.appSlug,
            entitlement: result.entitlement,
            issued_at: result.issuedAt,
            expires_at: result.expiresAt,
            jti: result.jti,
            assertion: result.assertion,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});

