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

/**
 * One workspace-scoped dashboard view. The selected workspace comes from the
 * central resolver, then every displayed fact is resolved inside that exact
 * workspace — never aggregated across memberships.
 */
export const getMyDashboardWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const {
      getSeatAccounting,
      listActiveWorkspaces,
      resolveAuthorizedApps,
      resolveWorkspaceAccess,
      resolveWorkspaceAppAuthorization,
      workspaceEntitlementRow,
    } = await import("./workspace.server");
    const { APP_KEYS } = await import("./apps");
    const { getPlan } = await import("./plans");

    const selected = await resolveAuthorizedApps(context.userId);
    if (!selected.workspaceId) {
      return {
        workspace: null,
        membership: null,
        plan: null,
        seats: null,
        apps: [],
        canManageBilling: false,
        activeWorkspaceCount: 0,
      };
    }

    const [access, entitlement, seats, workspaces, appResults] = await Promise.all([
      resolveWorkspaceAccess(context.userId, selected.workspaceId),
      workspaceEntitlementRow(selected.workspaceId),
      getSeatAccounting(selected.workspaceId),
      listActiveWorkspaces(context.userId),
      Promise.all(
        APP_KEYS.map((app) =>
          resolveWorkspaceAppAuthorization(context.userId, selected.workspaceId as string, app),
        ),
      ),
    ]);
    const plan = getPlan(entitlement?.plan_id ?? null);

    return {
      workspace: access.workspace,
      membership: access.membership
        ? {
            status: access.membership.status,
            roleKey: access.membership.roleKey,
            roleName: access.membership.roleName,
          }
        : null,
      plan: entitlement
        ? {
            id: entitlement.plan_id,
            name: plan?.name ?? entitlement.plan_id,
            status: entitlement.access_status,
            startDate: entitlement.access_start_date,
            expiryDate: entitlement.access_expiry_date,
          }
        : null,
      seats,
      apps: appResults.map((result) => ({
        slug: result.appSlug,
        authorized: result.authorized,
        accessLevel: result.accessLevel,
        reason: result.reason,
      })),
      // Billing delegation does not exist yet. App-level Manage is deliberately
      // irrelevant: only the workspace Owner may see or operate workspace billing.
      canManageBilling: access.isOwner,
      activeWorkspaceCount: workspaces.length,
    };
  });
