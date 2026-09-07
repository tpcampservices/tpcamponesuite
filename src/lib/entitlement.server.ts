// Server-only central entitlement authority for the TP-CAMP suite.
// Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const APP_SLUGS = ["catalog", "invoice", "splits", "operations", "finance"] as const;
export type AppSlug = (typeof APP_SLUGS)[number];

export const APP_ORIGINS: Record<AppSlug, string> = {
  catalog: "https://catalog.tpcamponesuite.app",
  invoice: "https://invoice.tpcamponesuite.app",
  splits: "https://splits.tpcamponesuite.app",
  operations: "https://operations.tpcamponesuite.app",
  finance: "https://finance.tpcamponesuite.app",
};

export const ONESUITE_ORIGIN = "https://tpcamponesuite.app";

export function isAppSlug(value: unknown): value is AppSlug {
  return typeof value === "string" && (APP_SLUGS as readonly string[]).includes(value);
}

/** Only TP-CAMP subdomains (plus localhost in dev) may call us or be redirected to. */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "tpcamponesuite.app" ||
      url.hostname === "www.tpcamponesuite.app" ||
      url.hostname.endsWith(".tpcamponesuite.app") ||
      url.hostname.endsWith(".lovable.app")
    );
  } catch {
    return false;
  }
}

/** Guards against open redirects: returns a safe absolute URL or null. */
export function safeReturnUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return isAllowedOrigin(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ONESUITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-tpcamp-key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export type Entitlement = {
  authenticated: boolean;
  user_id: string | null;
  email: string | null;
  subscription_active: boolean;
  subscription_status: string | null;
  expires_at: string | null;
  super_admin: boolean;
  entitled_apps: AppSlug[];
};

export const DENIED: Entitlement = {
  authenticated: false,
  user_id: null,
  email: null,
  subscription_active: false,
  subscription_status: null,
  expires_at: null,
  super_admin: false,
  entitled_apps: [],
};

/**
 * The single source of truth for suite access:
 *   active subscription with (expires_at IS NULL OR expires_at > now())  OR  super_admin.
 * Fails closed on any error.
 */
export async function computeEntitlement(
  userId: string,
  email: string | null,
): Promise<Entitlement> {
  try {
    // Keep stored state honest with the payment provider before deciding.
    try {
      const { syncUserSubscriptions } = await import("./subscription.server");
      await syncUserSubscriptions(userId);
    } catch (err) {
      console.error("Entitlement sync failed:", err);
    }

    const [rolesRes, subsRes] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin
        .from("subscriptions")
        .select("status, expires_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (rolesRes.error || subsRes.error) return { ...DENIED };

    const superAdmin = (rolesRes.data ?? []).some((r) => r.role === "super_admin");
    const now = Date.now();
    const subs = subsRes.data ?? [];
    const activeSub = subs.find(
      (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
    );
    const latest = subs[0] ?? null;
    const active = Boolean(activeSub) || superAdmin;

    return {
      authenticated: true,
      user_id: userId,
      email,
      subscription_active: active,
      subscription_status: activeSub?.status ?? latest?.status ?? (superAdmin ? "active" : null),
      expires_at: activeSub?.expires_at ?? latest?.expires_at ?? null,
      super_admin: superAdmin,
      entitled_apps: active ? [...APP_SLUGS] : [],
    };
  } catch (err) {
    console.error("computeEntitlement failed:", err);
    return { ...DENIED };
  }
}

/** Verify a OneSuite Supabase access token and return the user, or null. */
export async function userFromBearer(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// ---------------------------------------------------------------- SSO tickets

const TICKET_TTL_MS = 2 * 60 * 1000; // 2 minutes

function base64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashTicket(raw: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return base64url(new Uint8Array(digest));
}

/** Mint a single-use, short-lived handoff ticket for one child app. */
export async function issueTicket(userId: string, appSlug: AppSlug) {
  const raw = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("sso_tickets").insert({
    token_hash: await hashTicket(raw),
    user_id: userId,
    app_slug: appSlug,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  void purgeStaleTickets();
  return { ticket: raw, expiresAt };
}

/** Consume a ticket exactly once and return the entitlement it proves. */
export async function redeemTicket(
  raw: string,
  appSlug?: string,
): Promise<{ entitlement: Entitlement; app_slug: AppSlug } | null> {
  if (!raw || raw.length < 20 || raw.length > 200) return null;
  const hash = await hashTicket(raw);

  const { data, error } = await supabaseAdmin
    .from("sso_tickets")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, app_slug")
    .maybeSingle();

  if (error || !data) return null;
  if (appSlug && data.app_slug !== appSlug) return null;
  if (!isAppSlug(data.app_slug)) return null;

  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  const entitlement = await computeEntitlement(data.user_id, userRes?.user?.email ?? null);
  return { entitlement, app_slug: data.app_slug };
}

// -------------------------------------------------- server-to-server secrets

/** Constant-time string compare (avoids leaking secret length/content by timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Compare a fixed-length digest so differing lengths don't short-circuit.
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Authenticates a trusted child-app server.
 * Per-app secret (TPCAMP_SSO_KEY_FINANCE, …) wins; otherwise the shared
 * TPCAMP_SSO_KEY is accepted. If neither is configured, the check is skipped
 * (backwards compatible with the current deployment).
 */
export function verifyServerKey(provided: string | null, appSlug?: string): boolean {
  const perApp = appSlug ? process.env[`TPCAMP_SSO_KEY_${appSlug.toUpperCase()}`] : undefined;
  const shared = process.env["TPCAMP_SSO_KEY"];
  const expected = perApp || shared;
  if (!expected) return true; // no secret configured yet
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

/** True when any server credential is configured (used to require auth on S2S routes). */
export function serverKeyConfigured(appSlug?: string): boolean {
  const perApp = appSlug ? process.env[`TPCAMP_SSO_KEY_${appSlug.toUpperCase()}`] : undefined;
  return Boolean(perApp || process.env["TPCAMP_SSO_KEY"]);
}

/** Housekeeping: drop consumed/expired tickets so no auth artefacts linger. */
export async function purgeStaleTickets() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    await supabaseAdmin.from("sso_tickets").delete().lt("expires_at", cutoff);
    await supabaseAdmin
      .from("sso_tickets")
      .delete()
      .not("consumed_at", "is", null)
      .lt("consumed_at", cutoff);
  } catch {
    console.error("Ticket purge failed");
  }
}

/** Entitlement for a known OneSuite user id; null when the user does not exist. */
export async function entitlementForUserId(userId: string): Promise<Entitlement | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return computeEntitlement(data.user.id, data.user.email ?? null);
}
