// Phase 1A-E1: pure workspace-lifecycle gates. No I/O.

/** Plain-language message shown when an inactive workspace is administered. */
export const WORKSPACE_INACTIVE_MESSAGE =
  "This workspace is not active, so team changes are paused. Contact TP-CAMP support.";

/** Only an explicitly `active` workspace may run ordinary administrative mutations. */
export function workspaceAllowsAdminMutation(status: string | null | undefined): boolean {
  return status === "active";
}

/** Throws (sanitized) unless the resolved workspace is active. */
export function assertWorkspaceActiveForAdmin(
  workspace: { status: string } | null | undefined,
): void {
  if (!workspaceAllowsAdminMutation(workspace?.status)) {
    throw new Error(WORKSPACE_INACTIVE_MESSAGE);
  }
}

/**
 * A verified payment is always recorded (settlement, idempotency, accounting).
 * It never changes workspace status; an inactive workspace stays inaccessible
 * because every access path re-checks workspace status independently.
 */
export function paymentLifecycleOutcome(workspaceStatus: string | null | undefined) {
  const active = workspaceStatus === "active";
  return {
    recordPayment: true as const,
    reactivateWorkspace: false as const,
    workspaceAccessible: active,
    note: active ? null : ("paid_while_workspace_inactive" as const),
  };
}
