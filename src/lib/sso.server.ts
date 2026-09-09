// Server-only: OneSuite is the single identity + entitlement authority.
// Child apps never own a login. They receive a short-lived, single-use ticket,
// exchange it server-to-server for the user's identity and entitlement, then
// enforce their own resource limits against that entitlement.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { refreshEntitlementStatus, limitFor } from "./access.server";
import { getPlan, LIMIT_LABELS, type PlanLimits } from "./plans";
import { suiteApps } from "./tiers";

export const TICKET_TTL_SECONDS = 120;

export function appBySlug(slug: string) {
  return suiteApps.find((a) => a.slug === slug) ?? null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a one-time launch ticket for a signed-in OneSuite user. */
export async function mintTicket(userId: string, appSlug: string) {
  const app = appBySlug(appSlug);
  if (!app) throw new Error("Unknown application");
  const token = randomToken();
  const expires = new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString();
  const { error } = await supabaseAdmin.from("sso_tickets").insert({
    token_hash: await sha256(token),
    user_id: userId,
    app_slug: appSlug,
    expires_at: expires,
  });
  if (error) throw new Error("Could not start the secure hand-off.");
  return { token, url: `${app.url}/sso?ticket=${token}`, expiresAt: expires };
}

export type EntitlementPayload = {
  userId: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  planId: string | null;
  planName: string | null;
  status: "none" | "active" | "expired";
  hasAccess: boolean;
  billingPeriod: string | null;
  startDate: string | null;
  expiryDate: string | null;
  seats: number;
  limits: { metric: string; label: string; limit: number }[];
};

/** The authoritative entitlement every child app reads. */
export async function entitlementFor(userId: string): Promise<EntitlementPayload> {
  const [{ data: profile }, { data: roles }, row] = await Promise.all([
    supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    refreshEntitlementStatus(userId),
  ]);

  const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
  const plan = getPlan(row?.plan_id ?? null);
  const extraSeats = row?.seats_extra ?? 0;
  const active = row?.access_status === "active";

  const limits = plan
    ? (Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((metric) => ({
        metric,
        label: LIMIT_LABELS[metric],
        limit: limitFor(plan.id, metric, extraSeats),
      }))
    : [];

  return {
    userId,
    email: profile?.email ?? null,
    fullName: profile?.full_name ?? null,
    isSuperAdmin,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    status: (row?.access_status ?? "none") as EntitlementPayload["status"],
    hasAccess: isSuperAdmin || active,
    billingPeriod: row?.billing_period ?? null,
    startDate: row?.access_start_date ?? null,
    expiryDate: row?.access_expiry_date ?? null,
    seats: plan ? limitFor(plan.id, "seats", extraSeats) : 0,
    limits,
  };
}

/**
 * Redeem a launch ticket. Single-use and expiry-checked in one guarded update,
 * so a replayed ticket can never produce a second session.
 */
export async function redeemTicket(token: string, appSlug: string) {
  const hash = await sha256(token);
  const { data: ticket } = await supabaseAdmin
    .from("sso_tickets")
    .select("id, user_id, app_slug, expires_at, consumed_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!ticket) return { ok: false as const, reason: "invalid" as const };
  if (ticket.app_slug !== appSlug) return { ok: false as const, reason: "wrong_app" as const };
  if (ticket.consumed_at) return { ok: false as const, reason: "already_used" as const };
  if (new Date(ticket.expires_at).getTime() <= Date.now())
    return { ok: false as const, reason: "expired" as const };

  const { data: claimed } = await supabaseAdmin
    .from("sso_tickets")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", ticket.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false as const, reason: "already_used" as const };

  const entitlement = await entitlementFor(ticket.user_id);
  if (!entitlement.email) return { ok: false as const, reason: "no_email" as const };

  // A magic-link token_hash the child app verifies with
  // supabase.auth.verifyOtp({ token_hash, type: 'email' }) — same backend,
  // same user account, no separate child login.
  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: entitlement.email,
  });
  if (error || !link?.properties?.hashed_token) {
    console.error("SSO link generation failed", error);
    return { ok: false as const, reason: "link_failed" as const };
  }

  return {
    ok: true as const,
    tokenHash: link.properties.hashed_token,
    email: entitlement.email,
    entitlement,
  };
}

/** Shared secret guard for server-to-server calls from the child apps. */
export function childAppAuthorized(request: Request) {
  const key = process.env["TPCAMP_SSO_KEY"];
  const provided = request.headers.get("x-tpcamp-key") ?? "";
  if (!key || provided.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}
