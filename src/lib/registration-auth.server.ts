import { createHash, timingSafeEqual } from "crypto";

/**
 * Application-specific credentials for the Rights Registration source feed.
 * Never falls back to TPCAMP_SSO_KEY. Values are never logged or returned.
 *
 * Required credential format: 43–128 characters from [A-Za-z0-9_-], no
 * surrounding whitespace, at least 256 bits of randomness (e.g. 32 random
 * bytes encoded base64url). Anything else is treated as inactive.
 */
export type FeedApp = "catalog" | "splits";
export type FeedEnv = "development" | "production";

export const FEED_SLOTS = [
  { name: "REG_FEED_KEY_CATALOG_DEV", app: "catalog", env: "development" },
  { name: "REG_FEED_KEY_CATALOG_PROD", app: "catalog", env: "production" },
  { name: "REG_FEED_KEY_SPLITS_DEV", app: "splits", env: "development" },
  { name: "REG_FEED_KEY_SPLITS_PROD", app: "splits", env: "production" },
] as const satisfies readonly { name: string; app: FeedApp; env: FeedEnv }[];

export const CREDENTIAL_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EnvSource = Record<string, string | undefined>;

export type FeedConfig =
  | { ok: false }
  | {
      ok: true;
      slots: { name: string; app: FeedApp; env: FeedEnv; digest: Buffer }[];
      testWorkspaces: Set<string>;
      prodEnabled: boolean;
    };

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function isValidCredential(v: string | undefined): v is string {
  return typeof v === "string" && CREDENTIAL_FORMAT.test(v);
}

/** Validates configuration. Fails closed on duplicate credentials or invalid test-workspace list. */
export function loadFeedConfig(env: EnvSource): FeedConfig {
  const revoked = new Set(
    (env["REG_FEED_REVOKED"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const slots = FEED_SLOTS.filter((s) => !revoked.has(s.name) && isValidCredential(env[s.name])).map((s) => ({
    name: s.name,
    app: s.app as FeedApp,
    env: s.env as FeedEnv,
    digest: digest(env[s.name] as string),
  }));
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++)
      if (timingSafeEqual(slots[i].digest, slots[j].digest)) return { ok: false };

  const raw = env["REG_FEED_TEST_WORKSPACES"] ?? "";
  const testWorkspaces = new Set<string>();
  if (raw.trim() !== "") {
    for (const part of raw.split(",")) {
      const id = part.trim().toLowerCase();
      if (!UUID.test(id)) return { ok: false };
      testWorkspaces.add(id);
    }
  }
  return { ok: true, slots, testWorkspaces, prodEnabled: env["REG_FEED_PROD_ENABLED"] === "true" };
}

export type FeedAuthResult =
  | { ok: true; app: FeedApp; env: FeedEnv }
  | { ok: false; reason: "misconfigured" | "unauthorized" };

/** Header-only authentication. Never touches the request body. */
export function authenticateFeed(headers: Headers, config: FeedConfig): FeedAuthResult {
  if (!config.ok) return { ok: false, reason: "misconfigured" };
  const claimed = headers.get("x-tpcamp-app");
  const presented = headers.get("x-tpcamp-key") ?? "";
  const given = digest(presented);
  let match: (typeof config.slots)[number] | null = null;
  for (const s of config.slots) {
    // Compare every slot so timing does not reveal which slot matched.
    if (timingSafeEqual(given, s.digest) && presented.length > 0) match = s;
  }
  if (!match) return { ok: false, reason: "unauthorized" };
  if (claimed !== match.app) return { ok: false, reason: "unauthorized" };
  if (match.env === "production" && !config.prodEnabled) return { ok: false, reason: "unauthorized" };
  return { ok: true, app: match.app, env: match.env };
}

export function isJsonContentType(v: string | null) {
  if (!v) return false;
  const [type, ...params] = v.split(";").map((s) => s.trim().toLowerCase());
  if (type !== "application/json") return false;
  return params.every((p) => /^charset=("?)utf-8\1$/.test(p));
}

/** Environment policy: dev keys only reach designated test workspaces; prod keys never do. */
export function workspacePermitted(config: Extract<FeedConfig, { ok: true }>, env: FeedEnv, workspaceId: string) {
  const isTest = config.testWorkspaces.has(workspaceId.toLowerCase());
  return env === "development" ? isTest : !isTest;
}

/** Reads the body counting actual bytes; stops as soon as the limit is exceeded. */
export async function readBodyLimited(request: Request, limit: number): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8", { fatal: false }).decode(buf) };
}
