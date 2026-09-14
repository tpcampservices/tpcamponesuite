// Server-only account provisioning checks and non-destructive repair.
// The existing `handle_new_user` trigger remains the primary provisioning path;
// this only fills gaps it could not create (e.g. accounts made before it, or a
// transient failure). Nothing valid is ever overwritten.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveAccess } from "./entitlement-model";

export type ProvisioningReport = {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  authExists: boolean;
  profileExists: boolean;
  roleExists: boolean;
  roles: string[];
  workspace: string | null;
  entitlementExists: boolean;
  planId: string | null;
  accessStatus: string;
  hasAccess: boolean;
  subscriptionSource: string | null;
  paymentStatus: string | null;
  startDate: string | null;
  expiryDate: string | null;
  /** Human-readable list of what Repair Account would create. */
  missing: string[];
};

export async function inspectProvisioning(userId: string): Promise<ProvisioningReport> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("A valid user is required");

  const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = authRes?.user ?? null;

  const [{ data: profile }, { data: roles }, { data: ent }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("access_entitlements").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const roleList = (roles ?? []).map((r) => r.role as string);
  const entRow = ent as any;
  const derived = entRow
    ? deriveAccess({
        planId: entRow.plan_id,
        status: entRow.status,
        expiryDate: entRow.access_expiry_date,
      })
    : null;

  const missing: string[] = [];
  if (!profile) missing.push("Profile record (email, name, organisation, country)");
  if (!roleList.length) missing.push("Role record (member)");

  return {
    userId,
    email: user?.email ?? profile?.email ?? null,
    emailConfirmed: Boolean(user?.email_confirmed_at ?? user?.confirmed_at),
    lastSignInAt: user?.last_sign_in_at ?? null,
    authExists: Boolean(user),
    profileExists: Boolean(profile),
    roleExists: roleList.length > 0,
    roles: roleList,
    workspace: profile?.organisation ?? null,
    entitlementExists: Boolean(entRow),
    planId: entRow?.plan_id ?? null,
    accessStatus: derived?.status ?? "none",
    hasAccess: Boolean(derived?.hasAccess),
    subscriptionSource: entRow?.subscription_source ?? null,
    paymentStatus: entRow?.payment_status ?? null,
    startDate: entRow?.access_start_date ?? null,
    expiryDate: entRow?.access_expiry_date ?? null,
    missing,
  };
}

/** Creates only what is missing. Returns the list of records created. */
export async function repairProvisioning(userId: string): Promise<string[]> {
  const report = await inspectProvisioning(userId);
  if (!report.authExists) throw new Error("There is no authentication account for that id");

  const created: string[] = [];
  const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  const meta = (authRes?.user?.user_metadata ?? {}) as Record<string, unknown>;

  if (!report.profileExists) {
    const { error } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      email: authRes?.user?.email ?? null,
      full_name: (meta["full_name"] as string) ?? null,
      organisation: (meta["organisation"] as string) ?? null,
      country: (meta["country"] as string) ?? null,
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    created.push("profile");
  }

  if (!report.roleExists) {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "member" });
    if (error && error.code !== "23505") throw new Error(error.message);
    created.push("member role");
  }

  // Entitlements are deliberately NOT created here: access is granted through
  // a verified payment or an explicit administrative grant.
  return created;
}
