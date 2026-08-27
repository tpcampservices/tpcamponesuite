import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-to-server entitlement re-verification.
 *   POST /api/public/sso/verify   { "user_id": "<onesuite uuid>", "app": "finance" }
 *   Header: x-tpcamp-key: <TPCAMP_SSO_KEY_FINANCE or TPCAMP_SSO_KEY>
 *
 * The child app calls this from its OWN SERVER (never the browser), roughly every
 * 15 minutes or on session refresh. No customer access token is required.
 * Fails closed and never reveals whether an unknown UUID exists.
 */
export const Route = createFileRoute("/api/public/sso/verify")({
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
        const { corsHeaders, verifyServerKey, serverKeyConfigured, entitlementForUserId, isAppSlug, DENIED } =
          await import("@/lib/entitlement.server");
        const headers = {
          ...corsHeaders(request.headers.get("origin")),
          "Content-Type": "application/json",
        };

        try {
          const body = (await request.json()) as { user_id?: unknown; app?: unknown };
          const app = typeof body.app === "string" ? body.app : "";
          const userId = typeof body.user_id === "string" ? body.user_id : "";

          if (!isAppSlug(app)) {
            return new Response(JSON.stringify(DENIED), { status: 401, headers });
          }
          // This endpoint is server-only: a credential MUST be configured.
          if (!serverKeyConfigured(app) || !verifyServerKey(request.headers.get("x-tpcamp-key"), app)) {
            return new Response(JSON.stringify(DENIED), { status: 401, headers });
          }

          const entitlement = await entitlementForUserId(userId);
          if (!entitlement) {
            // Same shape/status for unknown and unentitled users — no enumeration.
            return new Response(JSON.stringify(DENIED), { status: 200, headers });
          }
          const entitled = entitlement.entitled_apps.includes(app);
          return new Response(
            JSON.stringify({
              ...entitlement,
              entitled_apps: entitled ? entitlement.entitled_apps : [],
              app_slug: app,
            }),
            { status: 200, headers },
          );
        } catch {
          console.error("SSO verify failed");
          return new Response(JSON.stringify(DENIED), { status: 500, headers });
        }
      },
    },
  },
});
