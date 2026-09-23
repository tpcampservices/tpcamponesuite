import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isEntitlementStatus,
  isPaymentStatus,
  isSubscriptionSource,
  type EntitlementPaymentStatus,
  type EntitlementStatus,
  type SubscriptionSource,
} from "./entitlement-model";

/**
 * Platform-admin account tooling. Every handler re-verifies platform-level
 * `super_admin` through the caller's own RLS-scoped client BEFORE any
 * privileged client is loaded, so a normal user (or a workspace owner) can
 * never reach the entitlement writer, whatever the browser sends.
 */
async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

const PLAN_IDS = ["starter", "growth", "pro", "institutional"] as const;
const APP_SLUGS = ["catalog", "invoice", "splits", "operations", "finance"] as const;

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Every account with its provisioning and access diagnostics. */
export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query?: string } | undefined) => ({
    query: typeof data?.query === "string" ? data.query.trim().slice(0, 120).toLowerCase() : "",
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPlan } = await import("./plans");
    const { deriveAccess } = await import("./entitlement-model");

    const authUsers: {
      id: string;
      email: string | null;
      emailConfirmed: boolean;
      lastSignInAt: string | null;
      createdAt: string | null;
      invitedAt: string | null;
      provider: string | null;
    }[] = [];

    for (let page = 1; page <= 10; page++) {
      const { data: res, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of res.users) {
        authUsers.push({
          id: u.id,
          email: u.email ?? null,
          emailConfirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
          lastSignInAt: u.last_sign_in_at ?? null,
          createdAt: u.created_at ?? null,
          invitedAt: (u as any).invited_at ?? null,
          provider: (u.app_metadata as any)?.provider ?? null,
        });
      }
      if (res.users.length < 200) break;
    }

    const [{ data: profiles }, { data: roles }, { data: entitlements }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, organisation, country"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("access_entitlements").select("*"),
    ]);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesById = new Map<string, string[]>();
    for (const r of roles ?? []) {
      rolesById.set(r.user_id, [...(rolesById.get(r.user_id) ?? []), r.role as string]);
    }
    const entById = new Map((entitlements ?? []).map((e: any) => [e.user_id, e]));
    const { listCrmStates } = await import("./crm.server");
    const crmById = await listCrmStates();

    const users = authUsers
      .map((u) => {
        const profile = profileById.get(u.id) ?? null;
        const ent = entById.get(u.id) ?? null;
        const derived = ent
          ? deriveAccess({
              planId: ent.plan_id,
              status: ent.status,
              expiryDate: ent.access_expiry_date,
            })
          : null;
        return {
          ...u,
          profileExists: Boolean(profile),
          fullName: profile?.full_name ?? null,
          workspace: profile?.organisation ?? null,
          roles: rolesById.get(u.id) ?? [],
          crm: crmById.get(u.id) ?? {
            provider: "hubspot" as const,
            status: "not_synced" as const,
            externalContactId: null,
            workspaceId: null,
            lastSyncedAt: null,
            lastAttemptedAt: null,
            attempts: 0,
            lastError: null,
            payloadHash: null,
          },
          entitlement: ent
            ? {
                planId: ent.plan_id as string | null,
                planName: getPlan(ent.plan_id)?.name ?? null,
                billingPeriod: ent.billing_period as string | null,
                status: (derived?.status ?? ent.status) as EntitlementStatus,
                hasAccess: Boolean(derived?.hasAccess),
                subscriptionSource: ent.subscription_source as SubscriptionSource,
                paymentStatus: ent.payment_status as EntitlementPaymentStatus,
                startDate: ent.access_start_date as string | null,
                expiryDate: ent.access_expiry_date as string | null,
                seatsLimit: (ent.seats_limit as number | null) ?? null,
                allowedApps: Array.isArray(ent.allowed_apps) ? (ent.allowed_apps as string[]) : null,
                notes: (ent.admin_notes as string | null) ?? null,
              }
            : null,
        };
      })
      .filter((u) => {
        if (!data.query) return true;
        const haystack = [u.email, u.fullName, u.workspace, u.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(data.query);
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return { users, total: authUsers.length };
  });

type GrantInput = {
  userId?: string;
  planId?: string;
  status?: string;
  subscriptionSource?: string;
  paymentStatus?: string;
  billingPeriod?: string;
  startDate?: string;
  expiryDate?: string;
  seatsLimit?: number;
  allowedApps?: string[];
  reason?: string;
};

function parseGrant(data: GrantInput) {
  const userId = String(data?.userId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("A valid user is required");
  const planId = (PLAN_IDS as readonly string[]).includes(data?.planId ?? "")
    ? (data!.planId as string)
    : null;
  if (!planId) throw new Error("Choose a plan from the published plan catalogue");
  if (!isEntitlementStatus(data?.status) || data.status === "none") {
    throw new Error("Choose a valid access status");
  }
  if (!isSubscriptionSource(data?.subscriptionSource)) {
    throw new Error("Choose a valid subscription source");
  }
  if (!isPaymentStatus(data?.paymentStatus)) throw new Error("Choose a valid payment status");
  if (data.subscriptionSource === "paypal") {
    // Manual grants must never masquerade as a PayPal payment: no fake orders,
    // captures, webhooks or invoices are ever written.
    throw new Error("PayPal access can only be granted by a verified PayPal payment");
  }

  return {
    userId,
    planId,
    status: data.status as EntitlementStatus,
    subscriptionSource: data.subscriptionSource as SubscriptionSource,
    paymentStatus: data.paymentStatus as EntitlementPaymentStatus,
    billingPeriod:
      data?.billingPeriod === "monthly"
        ? "monthly"
        : data?.billingPeriod === "none"
          ? "none"
          : "yearly",
    startDate: isoOrNull(data?.startDate) ?? new Date().toISOString(),
    expiryDate: isoOrNull(data?.expiryDate),
    seatsLimit:
      Number.isFinite(Number(data?.seatsLimit)) && Number(data?.seatsLimit) > 0
        ? Math.min(500, Math.floor(Number(data?.seatsLimit)))
        : null,
    allowedApps: Array.isArray(data?.allowedApps)
      ? data.allowedApps.filter((s) => (APP_SLUGS as readonly string[]).includes(s))
      : null,
    reason: String(data?.reason ?? "").trim().slice(0, 500) || null,
  };
}

/**
 * Manual administrative access grant / override. Server-authoritative:
 * the plan is validated against `plans.ts`, statuses against the shared
 * vocabulary, the acting admin is taken from the verified session (never the
 * browser), and every change is written to the append-only audit log.
 */
export const grantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GrantInput) => parseGrant(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.userId === context.userId) {
      // No self-elevation, even for a super admin.
      throw new Error("You cannot change your own access from this screen");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readEntitlement } = await import("./access.server");
    const { deriveAccess } = await import("./entitlement-model");
    const { getPlan } = await import("./plans");

    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!target?.user) throw new Error("That account no longer exists");

    const before = await readEntitlement(data.userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organisation")
      .eq("id", data.userId)
      .maybeSingle();

    // An explicit expiry date always wins. Otherwise the chosen term sets a
    // fixed access period, using calendar-month arithmetic; "no expiry" keeps
    // access open-ended (used for complimentary and internal accounts).
    const { addPeriod } = await import("./plans");
    const expiryDate =
      data.expiryDate ??
      (data.billingPeriod === "none"
        ? null
        : addPeriod(
            new Date(data.startDate),
            data.billingPeriod === "monthly" ? "monthly" : "yearly",
          ).toISOString());

    const derived = deriveAccess({
      planId: data.planId,
      status: data.status,
      expiryDate,
    });

    // A manual grant links the same workspace as a paid purchase would.
    const { ensureUserWorkspaceId } = await import("./workspace.server");
    const workspaceId = await ensureUserWorkspaceId(data.userId);

    const { error } = await supabaseAdmin.from("access_entitlements").upsert(
      {
        user_id: data.userId,
        workspace_id: workspaceId,
        plan_id: data.planId,
        billing_period: data.billingPeriod,
        currency: "USD",
        addons: (before?.addons ?? []) as never,
        seats_extra: before?.seats_extra ?? 0,
        status: derived.status,
        access_status: derived.accessStatus,
        subscription_source: data.subscriptionSource,
        payment_status: data.paymentStatus,
        access_start_date: data.startDate,
        access_expiry_date: expiryDate,
        seats_limit: data.seatsLimit,
        allowed_apps: data.allowedApps as never,
        admin_notes: data.reason,
        granted_by: context.userId,
        granted_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_access_audit").insert({
      actor_user_id: context.userId,
      actor_email: context.claims.email ?? null,
      target_user_id: data.userId,
      target_workspace: profile?.organisation ?? null,
      action: before ? "update_access" : "grant_access",
      old_plan_id: before?.plan_id ?? null,
      new_plan_id: data.planId,
      old_status: before?.status ?? null,
      new_status: derived.status,
      old_subscription_source: before?.subscription_source ?? null,
      new_subscription_source: data.subscriptionSource,
      old_payment_status: before?.payment_status ?? null,
      new_payment_status: data.paymentStatus,
      old_expiry_date: before?.access_expiry_date ?? null,
      new_expiry_date: expiryDate,
      reason: data.reason,
      details: {
        billing_period: data.billingPeriod,
        seats_limit: data.seatsLimit,
        allowed_apps: data.allowedApps,
        target_email: target.user.email ?? null,
      } as never,
    });

    return {
      ok: true as const,
      planName: getPlan(data.planId)?.name ?? data.planId,
      status: derived.status,
      hasAccess: derived.hasAccess,
    };
  });

/** Read-only account provisioning check — reports exactly what is missing. */
export const inspectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId?: string }) => ({
    userId: String(data?.userId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { inspectProvisioning } = await import("./provisioning.server");
    return inspectProvisioning(data.userId);
  });

/**
 * Non-destructive repair: creates ONLY the missing profile / role rows.
 * Existing profile, role, workspace and entitlement data is never overwritten,
 * and no entitlement is ever created here (access is granted deliberately).
 */
export const repairAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId?: string }) => ({
    userId: String(data?.userId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { inspectProvisioning, repairProvisioning } = await import("./provisioning.server");
    const before = await inspectProvisioning(data.userId);
    const created = await repairProvisioning(data.userId);
    const after = await inspectProvisioning(data.userId);

    if (created.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("admin_access_audit").insert({
        actor_user_id: context.userId,
        actor_email: context.claims.email ?? null,
        target_user_id: data.userId,
        action: "repair_account",
        reason: `Repaired: ${created.join(", ")}`,
        details: { created, before: before.missing } as never,
      });
    }

    return { ok: true as const, created, account: after };
  });

/** Audit trail for administrative access changes. Read-only, append-only store. */
export const listAccessAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId?: string } | undefined) => ({
    userId: typeof data?.userId === "string" ? data.userId.trim() : "",
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    let query = context.supabase
      .from("admin_access_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.userId) query = query.eq("target_user_id", data.userId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

/** Invite (or re-invite) a customer by email; the link lands on /auth/invite. */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string; redirectOrigin?: string }) => {
    const email = String(data?.email ?? "").trim().toLowerCase().slice(0, 255);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
    const origin =
      typeof data?.redirectOrigin === "string" && data.redirectOrigin.startsWith("http")
        ? data.redirectOrigin.replace(/\/$/, "").slice(0, 200)
        : "https://tpcamponesuite.app";
    return { email, origin };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${data.origin}/auth/invite`,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
