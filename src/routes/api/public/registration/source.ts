import { createFileRoute } from "@tanstack/react-router";
import { feedIssues, schemaForApp } from "@/lib/registration-feed.contract";

/**
 * Inbound feed from Catalog / Split Sheets into the Rights Registration Hub.
 * Contract: src/lib/registration-feed.contract.ts (version 1.0).
 * Server-to-server only. Stores one immutable snapshot per distinct content;
 * OneSuite never writes back to the source app through this route.
 */
const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/public/registration/source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const app = request.headers.get("x-tpcamp-app") ?? "";
        if (app !== "catalog" && app !== "splits") return json({ error: "invalid_app_slug" }, 400);

        const { childAppAuth } = await import("@/lib/sso.server");
        const auth = childAppAuth(request, app);
        if (!auth.ok) {
          if (auth.reason === "not_configured") return json({ error: "sso_key_not_configured" }, 503);
          return json({ error: auth.reason === "app_mismatch" ? "app_mismatch" : "unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_body", issues: [{ path: "", message: "Body must be JSON." }] }, 400);
        }
        const parsed = schemaForApp(app).safeParse(raw);
        if (!parsed.success) return json({ error: "invalid_body", issues: feedIssues(parsed.error) }, 400);
        const ev = parsed.data;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { entitledApps } = await import("@/lib/workspace.server");

          const { data: ws } = await supabaseAdmin
            .from("workspaces")
            .select("id, status")
            .eq("id", ev.workspace_id)
            .maybeSingle();
          if (!ws || ws.status !== "active") return json({ error: "workspace_not_found" }, 404);
          if (!(await entitledApps(ev.workspace_id)).includes(app)) return json({ error: "app_not_entitled" }, 403);

          // A work_uid is bound to exactly one workspace.
          const { data: elsewhere } = await supabaseAdmin
            .from("registration_works")
            .select("id")
            .eq("work_uid", ev.work_uid)
            .neq("workspace_id", ev.workspace_id)
            .limit(1);
          if (elsewhere && elsewhere.length) return json({ error: "work_workspace_conflict" }, 409);

          // Within the workspace, one source record per app per work.
          const { data: work } = await supabaseAdmin
            .from("registration_works")
            .select("catalog_work_id, split_sheet_id")
            .eq("workspace_id", ev.workspace_id)
            .eq("work_uid", ev.work_uid)
            .maybeSingle();
          const bound = app === "catalog" ? work?.catalog_work_id : work?.split_sheet_id;
          if (bound && bound !== ev.source_record_id) return json({ error: "source_record_conflict" }, 409);

          const { ingestSourceSnapshot } = await import("@/lib/registration.server");
          const result = await ingestSourceSnapshot({
            workspaceId: ev.workspace_id,
            sourceApp: app,
            entityType: app === "catalog" ? "work" : "composition_sheet",
            entityId: ev.source_record_id,
            workUid: ev.work_uid,
            sourceRevision: ev.source_revision,
            ownershipRevision: "ownership_revision" in ev ? ev.ownership_revision : null,
            eventId: ev.event_id,
            payload: ev.payload as Record<string, unknown>,
          });
          if (result.conflict) return json({ error: "event_id_reused" }, 409);
          return json(
            { ok: true, snapshot_id: result.snapshotId, duplicate: result.duplicate },
            result.duplicate ? 200 : 201,
          );
        } catch (err) {
          console.error("registration feed failed", { app, message: err instanceof Error ? err.message : "unknown" });
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
