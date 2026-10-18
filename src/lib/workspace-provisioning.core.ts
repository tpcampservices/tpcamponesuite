// Pure, dependency-injected core for Phase 1A-C additional workspace provisioning.
// No database client is imported here, so the security rules are unit-testable.
import { z } from "zod";

export const WORKSPACE_TYPES = [
  "customer",
  "managed_client",
  "demo",
  "internal",
  "integration_test",
] as const;
export const PROVISION_APP_KEYS = ["catalog", "splits", "operations", "finance", "invoice"] as const;
const LEVELS = ["no_access", "view", "edit", "manage"] as const;

export const provisionInputSchema = z
  .object({
    targetOwnerUserId: z.string().uuid(),
    workspaceName: z.string().trim().min(2).max(120),
    workspaceType: z.enum(WORKSPACE_TYPES),
    requestedSlug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/)
      .optional()
      .nullable(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
    appAccess: z
      .object(
        Object.fromEntries(PROVISION_APP_KEYS.map((k) => [k, z.enum(LEVELS).optional()])) as Record<
          (typeof PROVISION_APP_KEYS)[number],
          z.ZodOptional<z.ZodEnum<typeof LEVELS>>
        >,
      )
      .strict()
      .optional(),
  })
  .strict();

export type ProvisionInput = z.infer<typeof provisionInputSchema>;

export type ProvisionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN_SUPER_ADMIN_REQUIRED"
  | "INVALID_INPUT"
  | "INVALID_TARGET_OWNER"
  | "SLUG_ALREADY_EXISTS"
  | "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD"
  | "CONCURRENT_PROVISIONING_IN_PROGRESS"
  | "WORKSPACE_PROVISIONING_FAILED";

export type ProvisionResult =
  | { ok: true; workspaceId: string; slug: string; isExisting: boolean }
  | { ok: false; code: ProvisionErrorCode };

/** Maps the routine's RAISE tokens to client-safe codes. Anything else is generic. */
export function sanitizeDbError(message: string | null | undefined): ProvisionErrorCode {
  const m = (message ?? "").trim();
  switch (m) {
    case "UNAUTHORIZED":
      return "FORBIDDEN_SUPER_ADMIN_REQUIRED";
    case "INVALID_INPUT":
      return "INVALID_INPUT";
    case "INVALID_TARGET_OWNER":
      return "INVALID_TARGET_OWNER";
    case "SLUG_CONFLICT":
      return "SLUG_ALREADY_EXISTS";
    case "IDEMPOTENCY_CONFLICT":
      return "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD";
    case "CONCURRENT_REQUEST":
      return "CONCURRENT_PROVISIONING_IN_PROGRESS";
    default:
      return "WORKSPACE_PROVISIONING_FAILED";
  }
}

function canonical(input: ProvisionInput) {
  const access = Object.fromEntries(
    PROVISION_APP_KEYS.map((k) => [k, input.appAccess?.[k] ?? "no_access"]),
  );
  return JSON.stringify({
    targetOwnerUserId: input.targetOwnerUserId.toLowerCase(),
    workspaceName: input.workspaceName.trim(),
    workspaceType: input.workspaceType,
    requestedSlug: input.requestedSlug ?? null,
    appAccess: access,
  });
}

/** SHA-256 over the canonical payload; the idempotency key is NOT part of it. */
export async function inputHash(input: ProvisionInput): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(input)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ProvisionDeps = {
  /** Live database role check for the authenticated caller. */
  isSuperAdmin: (userId: string) => Promise<boolean>;
  callRoutine: (args: {
    _actor_user_id: string;
    _actor_email: string | null;
    _target_owner_user_id: string;
    _workspace_name: string;
    _workspace_type: string;
    _requested_slug: string | null;
    _idempotency_key: string;
    _input_hash: string;
    _app_access_levels: Record<string, string>;
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
  auditRejection: (entry: { actorUserId: string | null; code: ProvisionErrorCode; detail: string }) => Promise<void>;
  log: (msg: string, detail: Record<string, unknown>) => void;
};

/**
 * Actor identity comes ONLY from `actor` (the verified session), never from input.
 */
export async function runProvision(
  actor: { userId: string | null; email: string | null },
  raw: unknown,
  deps: ProvisionDeps,
): Promise<ProvisionResult> {
  if (!actor.userId) return { ok: false, code: "UNAUTHORIZED" };

  const fail = async (code: ProvisionErrorCode, detail: string): Promise<ProvisionResult> => {
    deps.log("[workspace-provisioning] rejected", { code, detail });
    try {
      await deps.auditRejection({ actorUserId: actor.userId, code, detail });
    } catch {
      deps.log("[workspace-provisioning] audit write failed", { code });
    }
    return { ok: false, code };
  };

  let superAdmin = false;
  try {
    superAdmin = await deps.isSuperAdmin(actor.userId);
  } catch {
    return fail("WORKSPACE_PROVISIONING_FAILED", "role_check_failed");
  }
  if (!superAdmin) return fail("FORBIDDEN_SUPER_ADMIN_REQUIRED", "not_super_admin");

  const parsed = provisionInputSchema.safeParse(raw);
  if (!parsed.success) return fail("INVALID_INPUT", "validation_failed");
  const input = parsed.data;

  const access = Object.fromEntries(
    PROVISION_APP_KEYS.map((k) => [k, input.appAccess?.[k] ?? "no_access"]),
  );

  let res: Awaited<ReturnType<ProvisionDeps["callRoutine"]>>;
  try {
    res = await deps.callRoutine({
      _actor_user_id: actor.userId,
      _actor_email: actor.email,
      _target_owner_user_id: input.targetOwnerUserId,
      _workspace_name: input.workspaceName,
      _workspace_type: input.workspaceType,
      _requested_slug: input.requestedSlug ?? null,
      _idempotency_key: input.idempotencyKey,
      _input_hash: await inputHash(input),
      _app_access_levels: access,
    });
  } catch (err) {
    return fail("WORKSPACE_PROVISIONING_FAILED", err instanceof Error ? err.message : "call_failed");
  }

  if (res.error) return fail(sanitizeDbError(res.error.message), res.error.message ?? "db_error");

  const d = res.data as { workspace_id?: string; slug?: string; is_existing?: boolean } | null;
  if (!d?.workspace_id) return fail("WORKSPACE_PROVISIONING_FAILED", "empty_result");
  return { ok: true, workspaceId: d.workspace_id, slug: d.slug ?? "", isExisting: Boolean(d.is_existing) };
}
