import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Inbound feed from Catalog / Split Sheets into the Rights Registration Hub.
 * Server-to-server only: x-tpcamp-key + x-tpcamp-app (catalog | splits).
 * Each call stores one immutable snapshot; OneSuite never writes back through here.
 */
const Body = z.object({
  workspace_id: z.string().uuid(),
  entity_type: z.enum(["work", "composition_sheet"]),
  entity_id: z.string().min(1).max(200),
  work_uid: z.string().min(1).max(200),
  source_revision: z.string().max(200).nullable().optional(),
  ownership_revision: z.string().max(200).nullable().optional(),
  event_id: z.string().max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const Route = createFileRoute("/api/public/registration/source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const app = request.headers.get("x-tpcamp-app") ?? "";
        if (app !== "catalog" && app !== "splits") {
          return Response.json({ error: "invalid_app_slug" }, { status: 400 });
        }
        const { childAppAuth } = await import("@/lib/sso.server");
        const auth = childAppAuth(request, app);
        if (!auth.ok) {
          return auth.reason === "not_configured"
            ? Response.json({ error: "sso_key_not_configured" }, { status: 503 })
            : Response.json({ error: "unauthorized" }, { status: 401 });
        }
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        if ((app === "catalog") !== (parsed.entity_type === "work")) {
          return Response.json({ error: "entity_type_not_allowed_for_app" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ws } = await supabaseAdmin
          .from("workspaces")
          .select("id, status")
          .eq("id", parsed.workspace_id)
          .maybeSingle();
        if (!ws || ws.status !== "active") {
          return Response.json({ error: "workspace_not_found" }, { status: 404 });
        }
        const { ingestSourceSnapshot } = await import("@/lib/registration.server");
        const result = await ingestSourceSnapshot({
          workspaceId: parsed.workspace_id,
          sourceApp: app,
          entityType: parsed.entity_type,
          entityId: parsed.entity_id,
          workUid: parsed.work_uid,
          sourceRevision: parsed.source_revision ?? null,
          ownershipRevision: parsed.ownership_revision ?? null,
          eventId: parsed.event_id ?? null,
          payload: parsed.payload,
        });
        return Response.json({ ok: true, snapshot_id: result.snapshotId, duplicate: result.duplicate });
      },
    },
  },
});
