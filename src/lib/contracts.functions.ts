import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getBusinessProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export type BusinessProfileInput = {
  legal_name: string;
  trading_name?: string;
  registration_number?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
  signatory_name?: string;
  signatory_title?: string;
  default_currency?: string;
  governing_law?: string;
};

const str = (value: unknown, max = 300) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: BusinessProfileInput) => {
    const legal_name = str(data?.legal_name, 200);
    if (!legal_name) throw new Error("Legal business name is required");
    return {
      legal_name,
      trading_name: str(data?.trading_name, 200),
      registration_number: str(data?.registration_number, 100),
      address: str(data?.address, 500),
      contact_email: str(data?.contact_email, 200),
      contact_phone: str(data?.contact_phone, 60),
      signatory_name: str(data?.signatory_name, 200),
      signatory_title: str(data?.signatory_title, 200),
      default_currency: str(data?.default_currency, 10) || "TTD",
      governing_law: str(data?.governing_law, 200) || "Republic of Trinidad and Tobago",
    };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("business_profiles")
      .upsert({ ...data, user_id: context.userId }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contracts")
      .select("id, template_id, template_title, title, counterparty, status, generated_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const saveContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      template_id: string;
      template_title: string;
      title: string;
      counterparty?: string;
      values: Record<string, string>;
      markGenerated?: boolean;
    }) => {
      const template_id = str(data?.template_id, 40);
      if (!template_id) throw new Error("Template is required");
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(data?.values ?? {})) {
        if (/^[A-Z0-9_]{1,60}$/.test(key)) values[key] = String(value ?? "").slice(0, 4000);
      }
      return {
        id: typeof data?.id === "string" && data.id ? data.id : undefined,
        template_id,
        template_title: str(data?.template_title, 200) || template_id,
        title: str(data?.title, 200) || "Untitled contract",
        counterparty: str(data?.counterparty, 200),
        values,
        markGenerated: Boolean(data?.markGenerated),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      template_id: data.template_id,
      template_title: data.template_title,
      title: data.title,
      counterparty: data.counterparty || null,
      values: data.values,
      status: data.markGenerated ? "generated" : "draft",
      ...(data.markGenerated ? { generated_at: new Date().toISOString() } : {}),
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("contracts")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await context.supabase
      .from("contracts")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contracts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
