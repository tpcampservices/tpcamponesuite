import { deriveAccess } from "./entitlement-model";
import { getPlan } from "./plans";

/**
 * Server-side Contract Builder entitlement gate.
 *
 * Every contract and business-profile server action calls the gate before any
 * database access. Page visibility is never relied on. The decision uses the
 * caller's current OneSuite workspace (same resolver as the dashboard and SSO),
 * their active membership in it, and that workspace's active plan. Team members
 * follow the workspace plan. Super Admins are allowed (platform rule).
 */
import { CONTRACT_BUILDER_DENIED } from "./contracts.core";
export { CONTRACT_BUILDER_DENIED };

export class ContractBuilderDeniedError extends Error {
  constructor() {
    super(CONTRACT_BUILDER_DENIED);
    this.name = "ContractBuilderDeniedError";
  }
}

export type ContractAccessInputs = {
  isSuperAdmin: boolean;
  workspace: { id: string; status: string } | null;
  membershipStatus: string | null;
  entitlement: {
    plan_id: string | null;
    status: string | null;
    access_expiry_date: string | null;
    workspace_id: string | null;
  } | null;
};

export const planIncludesContractBuilder = (planId: string | null | undefined) =>
  getPlan(planId)?.features.contractBuilder === true;

export function decideContractAccess(
  input: ContractAccessInputs & { planIncludes?: (planId: string | null) => boolean; now?: number },
): { ok: true; workspaceId: string | null } | { ok: false } {
  if (input.isSuperAdmin) return { ok: true, workspaceId: input.workspace?.id ?? null };
  const ws = input.workspace;
  if (!ws || ws.status !== "active") return { ok: false };
  if (input.membershipStatus !== "active") return { ok: false };
  const e = input.entitlement;
  if (!e) return { ok: false };
  if (e.workspace_id && e.workspace_id !== ws.id) return { ok: false };
  const access = deriveAccess({ planId: e.plan_id, status: e.status, expiryDate: e.access_expiry_date, now: input.now });
  if (!access.hasAccess) return { ok: false };
  const includes = input.planIncludes ?? planIncludesContractBuilder;
  if (!includes(e.plan_id)) return { ok: false };
  return { ok: true, workspaceId: ws.id };
}

export type ContractGate = (userId: string) => Promise<void>;

export function makeContractGate(
  load: (userId: string) => Promise<ContractAccessInputs>,
  opts: { planIncludes?: (planId: string | null) => boolean; log?: (code: string) => void } = {},
): ContractGate {
  return async (userId) => {
    let decision: { ok: boolean } = { ok: false };
    try {
      decision = decideContractAccess({ ...(await load(userId)), planIncludes: opts.planIncludes });
    } catch {
      decision = { ok: false };
    }
    if (!decision.ok) {
      (opts.log ?? ((c) => console.warn(c)))("contract_builder_not_entitled");
      throw new ContractBuilderDeniedError();
    }
  };
}

async function loadLiveInputs(userId: string): Promise<ContractAccessInputs> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveCurrentWorkspace, workspaceEntitlementRow } = await import("./workspace.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").limit(1);
  const isSuperAdmin = !!roles?.length;
  const ws = await resolveCurrentWorkspace(userId);
  if (!ws) return { isSuperAdmin, workspace: null, membershipStatus: null, entitlement: null };
  const { data: m } = await supabaseAdmin
    .from("workspace_memberships").select("status")
    .eq("workspace_id", ws.id).eq("user_id", userId).maybeSingle();
  const row = await workspaceEntitlementRow(ws.id);
  return {
    isSuperAdmin,
    workspace: { id: ws.id, status: ws.status },
    membershipStatus: m?.status ?? null,
    entitlement: row
      ? { plan_id: row.plan_id, status: row.status, access_expiry_date: row.access_expiry_date, workspace_id: row.workspace_id }
      : null,
  };
}

/** The live gate used by every contract and business-profile server action. */
export const requireContractBuilder: ContractGate = makeContractGate(loadLiveInputs);
