import { createFileRoute } from "@tanstack/react-router";

/**
 * Live authorization check for child applications.
 *
 * POST (server-to-server only, shared key):
 *   headers: x-tpcamp-key: <key>, x-tpcamp-app: <app_slug>
 *   body:    { user_id, app_slug, workspace_id? }
 *
 * The answer comes from the OneSuite resolver every time, so suspension,
 * removal, level changes, role changes, entitlement expiry, plan changes and
 * workspace status are reflected on the next call. No authorization logic lives
 * here and no billing/profile/permission detail is returned.
 */
export const Route = createFileRoute("/api/public/sso/authorization")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { childAppAuth, authorizationFor } = await import("@/lib/sso.server");
        const { isAppSlug } = await import("@/lib/apps");

        let body: { user_id?: unknown; app_slug?: unknown; workspace_id?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const appSlug = typeof body.app_slug === "string" ? body.app_slug : "";
        if (!isAppSlug(appSlug)) {
          return Response.json({ error: "invalid_app_slug" }, { status: 400 });
        }

        // Caller identity is verified against the requested application before
        // anything is resolved or revealed.
        const auth = childAppAuth(request, appSlug);
        if (!auth.ok) {
          if (auth.reason === "not_configured") {
            return Response.json({ error: "sso_key_not_configured" }, { status: 503 });
          }
          return Response.json({ error: auth.reason ?? "unauthorized" }, { status: 401 });
        }

        const userId = typeof body.user_id === "string" ? body.user_id : "";
        if (!/^[0-9a-f-]{36}$/i.test(userId)) {
          return Response.json({ error: "invalid_user_id" }, { status: 400 });
        }

        const result = await authorizationFor(userId, appSlug);

        // A workspace id in the request is only ever a cross-check of what the
        // child app cached. It never selects or widens the workspace.
        const claimed = typeof body.workspace_id === "string" ? body.workspace_id : null;
        if (claimed && result.workspace_id && claimed !== result.workspace_id) {
          return Response.json(
            {
              ...result,
              authorized: false,
              app_access: "no_access",
              permissions: [],
              reason: "workspace_mismatch",
              reason_code: "WORKSPACE_MISMATCH",
            },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        }

        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
