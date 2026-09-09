import { createFileRoute } from "@tanstack/react-router";

/**
 * Authoritative entitlement lookup for child apps.
 * POST { user_id } with header x-tpcamp-key. Child apps call this on their own
 * server (never from the browser) whenever they need the current plan, access
 * status and limit allowances for a signed-in OneSuite user.
 */
export const Route = createFileRoute("/api/public/sso/entitlement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { childAppAuth, entitlementFor } = await import("@/lib/sso.server");
        const auth = childAppAuth(request);
        if (!auth.ok) {
          return auth.reason === "not_configured"
            ? Response.json({ error: "sso_key_not_configured" }, { status: 503 })
            : Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let body: { user_id?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const userId = typeof body.user_id === "string" ? body.user_id : "";
        if (!/^[0-9a-f-]{36}$/i.test(userId)) {
          return Response.json({ error: "invalid_user_id" }, { status: 400 });
        }

        const entitlement = await entitlementFor(userId);
        return Response.json(entitlement, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
