import { z } from "zod";

/**
 * Registration Identity — the OneSuite submitting party for a workspace.
 * Pure validation + authorization decisions; I/O is injected so tenant rules are testable.
 */

const req = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const opt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const identityInputSchema = z.object({
  legal_name: req(200, "Legal name"),
  trading_name: opt(200, "Trading name"),
  contact_name: req(150, "Contact name"),
  contact_email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255, "Contact email must be 255 characters or fewer.")
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter a valid contact email."),
  contact_phone: opt(30, "Contact phone").refine((v) => v === null || /^\+?[0-9 ()-]{5,30}$/.test(v), "Enter a valid phone number."),
  address_street: opt(300, "Street"),
  address_city: opt(120, "City"),
  address_country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country must be a two-letter code, for example TT."),
  address_postal_code: opt(20, "Postal code"),
  signatory_name: req(150, "Signatory name"),
  signatory_title: req(120, "Signatory title"),
});
export type IdentityInputParsed = z.infer<typeof identityInputSchema>;

export type IdentityCtx = { authorized: boolean; workspaceId: string | null; canRead: boolean; canManageIdentity: boolean };

export type IdentityDeps<Row> = {
  load: (workspaceId: string) => Promise<Row | null>;
  save: (workspaceId: string, input: IdentityInputParsed) => Promise<Row>;
};

export const IDENTITY_DENIED = "Only a workspace owner or administrator can change the Registration Identity.";

/** Reads only the caller's server-resolved workspace. Any browser-supplied workspace id is ignored. */
export async function readIdentity<Row>(ctx: IdentityCtx, deps: IdentityDeps<Row>) {
  if (!ctx.authorized || !ctx.workspaceId || !ctx.canRead) return { allowed: false as const, identity: null, canEdit: false };
  return { allowed: true as const, identity: await deps.load(ctx.workspaceId), canEdit: ctx.canManageIdentity };
}

/** Writes only to the caller's server-resolved workspace, and only for Owner/Administrator. */
export async function writeIdentity<Row>(ctx: IdentityCtx, raw: unknown, deps: IdentityDeps<Row>) {
  if (!ctx.authorized || !ctx.workspaceId || !ctx.canManageIdentity) throw new Error(IDENTITY_DENIED);
  const obj = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  delete obj.workspace_id;
  const input = identityInputSchema.parse(obj);
  return deps.save(ctx.workspaceId, input);
}
