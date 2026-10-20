// Pure decision helpers for workspace-bound SSO (Phase 1B-A). No I/O here, so
// every rule is unit-testable.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Production rollout gate. A workspace may be launched into (scoped or legacy)
 * only while it is marked sso_eligible in the database. Provisioned secondary
 * workspaces default to false, so an explicit workspace id can never bypass
 * containment. Unknown / unreadable state fails closed.
 */
export function rolloutGateAllows(ssoEligible: boolean | null | undefined): boolean {
  return ssoEligible === true;
}

export type ScopedEntitlement = {
  hasAccess: boolean;
  status: "none" | "active" | "expired";
  planId: string | null;
  expiryDate: string | null;
};

/**
 * Entitlement claims for an assertion, taken ONLY from the authorized
 * workspace. A Super Admin keeps an explicit has_access exception (flagged by
 * is_super_admin) but never receives a fictitious plan or status.
 */
export function scopedEntitlementClaims(ent: ScopedEntitlement, isSuperAdmin: boolean) {
  return {
    has_access: isSuperAdmin || ent.hasAccess,
    plan_id: ent.planId ?? null,
    status: ent.status,
    super_admin_override: isSuperAdmin && !ent.hasAccess,
  };
}

export type TicketRow = {
  app_slug: string;
  expires_at: string;
  consumed_at: string | null;
  workspace_id: string | null;
};

/** Pre-claim checks. The atomic claim re-checks consumed/expired in SQL. */
export function ticketPrecheck(ticket: TicketRow | null, appSlug: string, nowMs: number) {
  if (!ticket) return "invalid" as const;
  if (ticket.app_slug !== appSlug) return "wrong_app" as const;
  if (ticket.consumed_at) return "already_used" as const;
  if (new Date(ticket.expires_at).getTime() <= nowMs) return "expired" as const;
  return null;
}

/** The workspace an authorization result must match, or a mismatch. */
export function assertWorkspaceInvariant(
  ticketWorkspaceId: string | null,
  authorizedWorkspaceId: string | null,
): boolean {
  if (ticketWorkspaceId === null) return authorizedWorkspaceId !== null;
  return authorizedWorkspaceId === ticketWorkspaceId;
}
