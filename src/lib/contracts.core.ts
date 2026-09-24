/**
 * Contract Builder handler bodies. Every function runs the entitlement gate
 * for the signed-in user FIRST, before touching the database. The database
 * client and gate are injected so the server actions and the tests exercise
 * the same code path. The user id always comes from the verified session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type Db = SupabaseClient<Database>;
export type CoreDeps = { db: Db; userId: string; gate: (userId: string) => Promise<void> };

export type BusinessProfileData = {
  legal_name: string;
  trading_name: string;
  registration_number: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  signatory_name: string;
  signatory_title: string;
  default_currency: string;
  governing_law: string;
};

export type SaveContractData = {
  id?: string;
  template_id: string;
  template_title: string;
  title: string;
  counterparty: string;
  values: Record<string, string>;
  markGenerated: boolean;
};

export async function coreGetBusinessProfile({ db, userId, gate }: CoreDeps) {
  await gate(userId);
  const { data, error } = await db.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function coreSaveBusinessProfile({ db, userId, gate }: CoreDeps, data: BusinessProfileData) {
  await gate(userId);
  const { data: row, error } = await db
    .from("business_profiles")
    .upsert({ ...data, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function coreListContracts({ db, userId, gate }: CoreDeps) {
  await gate(userId);
  const { data, error } = await db
    .from("contracts")
    .select("id, template_id, template_title, title, counterparty, status, generated_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function coreGetContract({ db, userId, gate }: CoreDeps, data: { id: string }) {
  await gate(userId);
  const { data: row, error } = await db
    .from("contracts").select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return row ?? null;
}

export async function coreSaveContract({ db, userId, gate }: CoreDeps, data: SaveContractData) {
  await gate(userId);
  const payload = {
    user_id: userId,
    template_id: data.template_id,
    template_title: data.template_title,
    title: data.title,
    counterparty: data.counterparty || null,
    values: data.values,
    status: data.markGenerated ? "generated" : "draft",
    ...(data.markGenerated ? { generated_at: new Date().toISOString() } : {}),
  };
  if (data.id) {
    const { data: row, error } = await db
      .from("contracts").update(payload).eq("id", data.id).eq("user_id", userId).select().single();
    if (error) throw new Error(error.message);
    return row;
  }
  const { data: row, error } = await db.from("contracts").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return row;
}

export async function coreDeleteContract({ db, userId, gate }: CoreDeps, data: { id: string }) {
  await gate(userId);
  const { error } = await db.from("contracts").delete().eq("id", data.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
