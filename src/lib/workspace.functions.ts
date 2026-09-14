import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Read-only view of the signed-in user's own workspace authorization.
 * The user id comes from the verified bearer token, never from the request body.
 * Nothing here gates existing access — the dashboard, SSO and entitlement flows
 * are unchanged in this phase.
 */
export const getMyWorkspaceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { resolveCurrentWorkspace, resolveWorkspaceAccess, getSeatAccounting } =
      await import("./workspace.server");

    const workspace = await resolveCurrentWorkspace(userId);
    if (!workspace) {
      return { workspace: null, access: null, seats: null };
    }

    const [access, seats] = await Promise.all([
      resolveWorkspaceAccess(userId, workspace.id),
      getSeatAccounting(workspace.id),
    ]);

    return { workspace, access, seats };
  });

/**
 * The applications this signed-in user may actually see and launch:
 * workspace entitlement ∩ member app access ∩ role permissions.
 * The dashboard reads this instead of assuming an active plan unlocks all apps.
 */
export const getMyAuthorizedApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAuthorizedApps } = await import("./workspace.server");
    const resolved = await resolveAuthorizedApps(context.userId);
    return { ...resolved, apps: resolved.apps as string[] };
  });
