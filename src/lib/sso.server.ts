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

const ASSERTION_TTL_SECONDS = 120;

function b64url(bytes: Uint8Array | string) {
  const raw =
    typeof bytes === "string" ? bytes : String.fromCharCode(...Array.from(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ssoKey() {
  const key = process.env["TPCAMP_SSO_KEY"];
  if (!key) throw new Error("TPCAMP_SSO_KEY is not configured");
  return key;
}

/**
 * Short-lived HS256 JWT signed with the shared TPCAMP_SSO_KEY.
 * Child apps verify it on their own server; nothing here ever reaches a browser.
 */
async function signAssertion(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ssoKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)),
  );
  return `${data}.${b64url(sig)}`;
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

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ASSERTION_TTL_SECONDS;
  const jti = randomToken();

  let assertion: string;
  try {
    assertion = await signAssertion({
      iss: "tpcamp-onesuite",
      aud: appSlug,
      sub: ticket.user_id,
      email: entitlement.email,
      name: entitlement.fullName,
      app_slug: appSlug,
      is_super_admin: entitlement.isSuperAdmin,
      has_access: entitlement.hasAccess,
      plan_id: entitlement.planId,
      status: entitlement.status,
      jti,
      iat: issuedAt,
      exp: expiresAt,
    });
  } catch (err) {
    console.error("SSO assertion signing failed", err);
    return { ok: false as const, reason: "assertion_failed" as const };
  }

  return {
    ok: true as const,
    canonicalUserId: ticket.user_id,
    email: entitlement.email,
    name: entitlement.fullName,
    appSlug,
    assertion,
    issuedAt,
    expiresAt,
    jti,
    entitlement,
  };
}


/**
 * Shared secret guard for server-to-server calls from the child apps.
 * Tolerant of stray whitespace, newlines or wrapping quotes on either side —
 * never of a wrong value. Returns a reason so a missing server secret is
 * distinguishable from a bad caller key (the value itself is never revealed).
 */
function clean(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function lengthRange(length: number) {
  if (length === 0) return "0";
  if (length < 32) return "1-31";
  if (length < 64) return "32-63";
  if (length < 128) return "64-127";
  return "128+";
}

export function childAppAuth(request: Request): { ok: boolean; reason?: "not_configured" | "unauthorized" } {
  const key = clean(process.env["TPCAMP_SSO_KEY"] ?? "");
  const rawProvided =
    request.headers.get("x-tpcamp-key") ??
      request.headers.get("X-TPCAMP-KEY") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
  const provided = clean(rawProvided);
  if (!key) {
    console.warn("SSO authorization", {
      serverKeyConfigured: false,
      headerReceived: rawProvided.length > 0,
      receivedLengthRange: lengthRange(provided.length),
      matched: false,
    });
    return { ok: false, reason: "not_configured" };
  }
  if (provided.length !== key.length) {
    console.warn("SSO authorization", {
      serverKeyConfigured: true,
      serverKeyLengthRange: lengthRange(key.length),
      headerReceived: rawProvided.length > 0,
      receivedLengthRange: lengthRange(provided.length),
      matched: false,
    });
    return { ok: false, reason: "unauthorized" };
  }
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ provided.charCodeAt(i);
  const matched = diff === 0;
  console.info("SSO authorization", {
    serverKeyConfigured: true,
    serverKeyLengthRange: lengthRange(key.length),
    headerReceived: rawProvided.length > 0,
    receivedLengthRange: lengthRange(provided.length),
    matched,
  });
  return matched ? { ok: true } : { ok: false, reason: "unauthorized" };
}

export function childAppAuthorized(request: Request) {
  return childAppAuth(request).ok;
}
