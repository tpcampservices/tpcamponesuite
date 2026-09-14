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
