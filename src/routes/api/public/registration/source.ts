import { createFileRoute } from "@tanstack/react-router";

/**
 * Inbound feed from Catalog / Split Sheets into the Rights Registration Hub.
 * Contract: src/lib/registration-feed.contract.ts (version 1.0, revision 3).
 * Authenticated with application-specific credentials (REG_FEED_KEY_*),
 * never the shared SSO key. Stores one immutable snapshot per distinct
 * content; OneSuite never writes back to the source app through this route.
 */
export const Route = createFileRoute("/api/public/registration/source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSourceFeed } = await import("@/lib/registration-feed-handler.server");
        return handleSourceFeed(request, process.env, {
          async workspaceActive(id) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin.from("workspaces").select("status").eq("id", id).maybeSingle();
            return data?.status === "active";
          },
          async entitled(id, app) {
            const { entitledApps } = await import("@/lib/workspace.server");
            return (await entitledApps(id)).includes(app);
          },
          async workInOtherWorkspace(workUid, workspaceId) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("registration_works").select("id").eq("work_uid", workUid).neq("workspace_id", workspaceId).limit(1);
            return !!data?.length;
          },
          async boundSourceRecord(workspaceId, workUid, app) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("registration_works").select("catalog_work_id, split_sheet_id")
              .eq("workspace_id", workspaceId).eq("work_uid", workUid).maybeSingle();
            return (app === "catalog" ? data?.catalog_work_id : data?.split_sheet_id) ?? null;
          },
          async ingest(i) {
            const { ingestSourceSnapshot } = await import("@/lib/registration.server");
            return ingestSourceSnapshot(i);
          },
          log(msg, fields) {
            console.warn(msg, fields);
          },
        });
      },
    },
  },
});
