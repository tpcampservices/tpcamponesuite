/**
 * Server-only CRM (HubSpot) preparation — Phase 1.
 *
 * - NO external requests are made from this module. There is no HubSpot client yet.
 * - CRM state lives only in `crm_contacts`; nothing here writes to entitlements,
 *   memberships, roles, app access or payments. CRM can never grant/revoke access.
 * - The payload is built exclusively from existing TP-CAMP sources and resolvers,
 *   then filtered through an explicit allow-list.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { APPS, type AppSlug } from "./apps";
import { getPlan } from "./plans";
import {
  getSeatAccounting,
  resolveAppAuthorization,
  resolveAuthorizedApps,
  workspaceEntitlementRow,
} from "./workspace.server";

export const CRM_PROVIDER = "hubspot" as const;
export const CRM_SYNC_STATUSES = ["not_synced", "pending", "synced", "failed", "needs_update"] as const;
export type CrmSyncStatus = (typeof CRM_SYNC_STATUSES)[number];

export type CrmContactState = {
  provider: typeof CRM_PROVIDER;
  status: CrmSyncStatus;
  externalContactId: string | null;
  workspaceId: string | null;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  attempts: number;
  lastError: string | null;
  payloadHash: string | null;
};

/** Customer-level payment wording only. Never provider ids, captures or amounts. */
const PAYMENT_STATUS_CRM: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Past Due",
  refunded: "Refunded",
  not_required: "Not Required",
};

/**
 * EXPLICIT ALLOW-LIST — the only fields that may ever leave TP-CAMP for the CRM.
 * Anything not listed here is dropped by `sanitizeCrmPayload`.
 */
export const CRM_ALLOWED_FIELDS = [
  "tpcamp_user_id",
  "email",
  "first_name",
  "last_name",
  "full_name",
  "country",
  "last_login_at",
  "signup_date",
  "organisation",
  "legal_business_name",
  "trading_name",
  "business_registration_number",
  "business_address",
  "contact_phone",
  "website",
  "current_plan",
  "subscription_status",
  "payment_status",
  "billing_period",
  "access_start_date",
  "access_expiry_date",
  "subscription_source",
  "workspace_id",
  "workspace_name",
  "workspace_role",
  "seats_limit",
  "seats_used",
  "app_catalog_access",
  "app_splits_access",
  "app_invoice_access",
  "app_operations_access",
  "app_finance_access",
] as const;
export type CrmField = (typeof CRM_ALLOWED_FIELDS)[number];
export type CrmPayload = Record<CrmField, string | number | null>;

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e || null;
}

export function sanitizeCrmPayload(input: Record<string, unknown>): CrmPayload {
  const out = {} as CrmPayload;
  for (const key of CRM_ALLOWED_FIELDS) {
    const v = input[key];
    out[key] = typeof v === "string" || typeof v === "number" ? v : null;
  }
  return out;
}

/** Stable hash over the sanitized payload — used for idempotent change detection. */
export function hashCrmPayload(payload: CrmPayload): string {
  const canonical = JSON.stringify(CRM_ALLOWED_FIELDS.map((k) => [k, payload[k] ?? null]));
  return createHash("sha256").update(canonical).digest("hex");
}

function splitName(full: string | null) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

/** Builds (never sends) the normalized CRM payload for one account. Read-only. */
export async function buildCrmPayload(userId: string): Promise<{
  payload: CrmPayload;
  hash: string;
  workspaceId: string | null;
}> {
  const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = authRes?.user;
  if (!user) throw new Error("That account no longer exists");

  const [{ data: profile }, { data: business }, resolved] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name, organisation, country, email").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("business_profiles")
      .select("legal_name, trading_name, registration_number, address, contact_phone")
      .eq("user_id", userId)
      .maybeSingle(),
    resolveAuthorizedApps(userId),
  ]);

  const workspaceId = resolved.workspaceId;
  const [workspaceRow, entitlement, seats, roleRow] = await Promise.all([
    workspaceId
      ? supabaseAdmin.from("workspaces").select("name").eq("id", workspaceId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    workspaceId ? workspaceEntitlementRow(workspaceId) : Promise.resolve(null),
    workspaceId ? getSeatAccounting(workspaceId).catch(() => null) : Promise.resolve(null),
    resolved.roleKey
      ? supabaseAdmin
          .from("workspace_roles")
          .select("name")
          .eq("role_key", resolved.roleKey)
          .is("workspace_id", null)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  // Per-app access comes from Central Authorization v2 — never re-derived here.
  const appAccess: Record<string, string> = {};
  for (const app of APPS) {
    const auth = await resolveAppAuthorization(userId, app.key);
    appAccess[app.key as AppSlug] = auth.authorized ? auth.accessLevel : "no_access";
  }

  const ent = entitlement as Record<string, any> | null;
  const fullName = profile?.full_name ?? null;
  const { first, last } = splitName(fullName);

  const payload = sanitizeCrmPayload({
    tpcamp_user_id: userId,
    email: normalizeEmail(user.email ?? profile?.email),
    first_name: first,
    last_name: last,
    full_name: fullName,
    country: profile?.country ?? null,
    last_login_at: user.last_sign_in_at ?? null,
    signup_date: user.created_at ?? null,
    organisation: profile?.organisation ?? null,
    legal_business_name: business?.legal_name ?? null,
    trading_name: business?.trading_name ?? null,
    business_registration_number: business?.registration_number ?? null,
    business_address: business?.address ?? null,
    contact_phone: business?.contact_phone ?? null,
    website: null, // not currently captured by TP-CAMP
    current_plan: ent?.plan_id ? (getPlan(ent.plan_id)?.name ?? ent.plan_id) : null,
    subscription_status: ent?.status ?? "none",
    payment_status: ent?.payment_status ? (PAYMENT_STATUS_CRM[ent.payment_status] ?? null) : null,
    billing_period: ent?.billing_period ?? null,
    access_start_date: ent?.access_start_date ?? null,
    access_expiry_date: ent?.access_expiry_date ?? null,
    subscription_source: ent?.subscription_source ?? null,
    workspace_id: workspaceId,
    workspace_name: workspaceRow?.name ?? null,
    workspace_role: roleRow?.name ?? resolved.roleKey,
    seats_limit: seats?.totalSeats ?? ent?.seats_limit ?? null,
    seats_used: seats?.usedSeats ?? null,
    app_catalog_access: appAccess.catalog,
    app_splits_access: appAccess.splits,
    app_invoice_access: appAccess.invoice,
    app_operations_access: appAccess.operations,
    app_finance_access: appAccess.finance,
  });

  return { payload, hash: hashCrmPayload(payload), workspaceId };
}

function toState(row: any | null): CrmContactState {
  return {
    provider: CRM_PROVIDER,
    status: (row?.sync_status as CrmSyncStatus) ?? "not_synced",
    externalContactId: row?.external_contact_id ?? null,
    workspaceId: row?.workspace_id ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastAttemptedAt: row?.last_attempted_at ?? null,
    attempts: row?.sync_attempts ?? 0,
    lastError: row?.last_error ?? null,
    payloadHash: row?.last_payload_hash ?? null,
  };
}

export async function listCrmStates(): Promise<Map<string, CrmContactState>> {
  const { data } = await supabaseAdmin.from("crm_contacts").select("*").eq("crm_provider", CRM_PROVIDER);
  return new Map((data ?? []).map((r) => [r.user_id, toState(r)]));
}

export async function readCrmState(userId: string): Promise<CrmContactState> {
  const { data } = await supabaseAdmin
    .from("crm_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("crm_provider", CRM_PROVIDER)
    .maybeSingle();
  return toState(data);
}

/** Idempotent upsert keyed by (user_id, crm_provider). Touches crm_contacts only. */
async function writeCrm(userId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("crm_contacts")
    .upsert({ user_id: userId, crm_provider: CRM_PROVIDER, ...patch } as never, {
      onConflict: "user_id,crm_provider",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toState(data);
}

export async function markCrmPending(userId: string) {
  const { hash, workspaceId, payload } = await buildCrmPayload(userId);
  return writeCrm(userId, {
    sync_status: "pending",
    workspace_id: workspaceId,
    normalized_email: payload.email,
    last_payload_hash: hash,
  });
}

export async function recordCrmError(userId: string, message: string) {
  const current = await readCrmState(userId);
  return writeCrm(userId, {
    sync_status: "failed",
    last_error: message.slice(0, 1000),
    last_attempted_at: new Date().toISOString(),
    sync_attempts: current.attempts + 1,
  });
}

export async function recordCrmSuccess(userId: string, externalContactId: string, payloadHash?: string) {
  return writeCrm(userId, {
    sync_status: "synced",
    external_contact_id: externalContactId,
    last_error: null,
    last_synced_at: new Date().toISOString(),
    last_attempted_at: new Date().toISOString(),
    ...(payloadHash ? { last_payload_hash: payloadHash } : {}),
  });
}

/** Resets the record for a manual retry — keeps the known contact id for idempotency. */
export async function prepareCrmRetry(userId: string) {
  return writeCrm(userId, { sync_status: "pending", last_error: null });
}

/** Compares the live payload with the last synced hash; flags drift as needs_update. */
export async function refreshCrmDrift(userId: string) {
  const state = await readCrmState(userId);
  const { hash } = await buildCrmPayload(userId);
  if (state.status === "synced" && state.payloadHash && state.payloadHash !== hash) {
    return writeCrm(userId, { sync_status: "needs_update" });
  }
  return state;
}
