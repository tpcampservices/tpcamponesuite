/**
 * Shared vocabulary for the single authoritative access layer
 * (`public.access_entitlements`). Pure, browser-safe: no server imports.
 *
 * Architecture: Authentication → User/Profile → Workspace → Plan →
 * Access Entitlement → App/Feature permissions.
 *
 * Plan feature definitions live ONLY in `src/lib/plans.ts`. Nothing here
 * duplicates plan limits — an entitlement points at a plan id.
 */

export const SUBSCRIPTION_SOURCES = [
  "paypal",
  "manual_admin",
  "complimentary",
  "promotional",
  "migration",
  "internal",
  "trial",
] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

export const PAYMENT_STATUSES = [
  "paid",
  "not_required",
  "pending",
  "failed",
  "refunded",
] as const;
export type EntitlementPaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ENTITLEMENT_STATUSES = [
  "none",
  "active",
  "trial",
  "pending_payment",
  "past_due",
  "suspended",
  "cancelled",
  "expired",
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/** Statuses that grant application access while inside the access period. */
export const ACCESS_GRANTING_STATUSES: EntitlementStatus[] = ["active", "trial"];

export const SOURCE_LABELS: Record<SubscriptionSource, string> = {
  paypal: "PayPal payment",
  manual_admin: "Manual (admin)",
  complimentary: "Complimentary",
  promotional: "Promotional",
  migration: "Migrated account",
  internal: "Internal / staff",
  trial: "Trial",
};

export const STATUS_LABELS: Record<EntitlementStatus, string> = {
  none: "No access yet",
  active: "Active",
  trial: "Trial",
  pending_payment: "Pending payment",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const PAYMENT_STATUS_LABELS: Record<EntitlementPaymentStatus, string> = {
  paid: "Paid",
  not_required: "Not required",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
};

export function isSubscriptionSource(value: unknown): value is SubscriptionSource {
  return (SUBSCRIPTION_SOURCES as readonly string[]).includes(String(value));
}
export function isPaymentStatus(value: unknown): value is EntitlementPaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(String(value));
}
export function isEntitlementStatus(value: unknown): value is EntitlementStatus {
  return (ENTITLEMENT_STATUSES as readonly string[]).includes(String(value));
}

/**
 * The one access decision used everywhere: the rich `status` plus the access
 * period decide the effective status and the legacy `access_status` value that
 * suite apps and SSO already read.
 */
export function deriveAccess(input: {
  planId: string | null | undefined;
  status: string | null | undefined;
  expiryDate: string | null | undefined;
  now?: number;
}): { status: EntitlementStatus; accessStatus: "none" | "active" | "expired"; hasAccess: boolean } {
  const now = input.now ?? Date.now();
  const raw: EntitlementStatus = isEntitlementStatus(input.status) ? input.status : "none";

  if (!input.planId) return { status: "none", accessStatus: "none", hasAccess: false };

  const lapsed =
    input.expiryDate != null && new Date(input.expiryDate).getTime() <= now;

  // An open-ended grant (no expiry) never lapses.
  if (ACCESS_GRANTING_STATUSES.includes(raw)) {
    if (lapsed) return { status: "expired", accessStatus: "expired", hasAccess: false };
    return { status: raw, accessStatus: "active", hasAccess: true };
  }

  return { status: raw, accessStatus: raw === "none" ? "none" : "expired", hasAccess: false };
}
