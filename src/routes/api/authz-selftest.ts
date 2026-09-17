/**
 * TEMPORARY test-only harness route. Delete after the authorization test run.
 * Not under /api/public, so the published site's auth also covers it, and every
 * request must carry the one-time key below.
 */
import { createFileRoute } from "@tanstack/react-router";

const KEY = "1d8f717a9bcc9201c6432b020f5a66d5e87790680be84824";

export const Route = createFileRoute("/api/authz-selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-selftest-key") !== KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json()) as {
          op: string;
          table?: string;
          rows?: unknown;
          match?: Record<string, unknown>;
          values?: Record<string, unknown>;
          columns?: string;
          email?: string;
          user_id?: string;
          app_slug?: string;
          name?: string;
          args?: Record<string, unknown>;
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          switch (body.op) {
            case "user_create": {
              const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email: body.email!,
                email_confirm: true,
                password: crypto.randomUUID(),
              });
              return Response.json({ id: data.user?.id ?? null, error: error?.message ?? null });
            }
            case "user_delete": {
              const { error } = await supabaseAdmin.auth.admin.deleteUser(body.user_id!);
              return Response.json({ error: error?.message ?? null });
            }
            case "insert": {
              const q = supabaseAdmin.from(body.table as never).insert(body.rows as never);
              const { data, error } = await q.select();
              return Response.json({ data, error: error?.message ?? null });
            }
            case "update": {
              let q = supabaseAdmin.from(body.table as never).update(body.values as never);
              for (const [k, v] of Object.entries(body.match ?? {})) q = q.eq(k, v as never);
              const { data, error } = await q.select();
              return Response.json({ data, error: error?.message ?? null });
            }
            case "delete": {
              let q = supabaseAdmin.from(body.table as never).delete();
              for (const [k, v] of Object.entries(body.match ?? {})) q = q.eq(k, v as never);
              const { error } = await q;
              return Response.json({ error: error?.message ?? null });
            }
            case "select": {
              let q = supabaseAdmin.from(body.table as never).select(body.columns ?? "*");
              for (const [k, v] of Object.entries(body.match ?? {})) q = q.eq(k, v as never);
              const { data, error } = await q;
              return Response.json({ data, error: error?.message ?? null });
            }
            case "rpc": {
              const { data, error } = await supabaseAdmin.rpc(
                body.name as never,
                body.args as never,
              );
              return Response.json({ data, error: error?.message ?? null });
            }
            case "cleanup": {
              const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
              const targets = (list?.users ?? []).filter((u) =>
                (u.email ?? "").startsWith("authztest-"),
              );
              for (const u of targets) {
                await supabaseAdmin.from("access_entitlements").delete().eq("user_id", u.id);
                await supabaseAdmin.from("workspace_memberships").delete().eq("user_id", u.id);
                await supabaseAdmin.from("user_roles").delete().eq("user_id", u.id);
                await supabaseAdmin.from("workspaces").delete().eq("owner_user_id", u.id);
                await supabaseAdmin.from("profiles").delete().eq("id", u.id);
                await supabaseAdmin.auth.admin.deleteUser(u.id);
              }
              return Response.json({ removed: targets.length });
            }
            case "authz": {
              const { authorizationFor } = await import("@/lib/sso.server");
              return Response.json(await authorizationFor(body.user_id!, body.app_slug!));
            }
            default:
              return Response.json({ error: "unknown_op" }, { status: 400 });
          }
        } catch (error) {
          return Response.json({ error: String(error) }, { status: 500 });
        }
      },
    },
  },
});
