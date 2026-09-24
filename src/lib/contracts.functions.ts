import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  coreDeleteContract,
  coreGetBusinessProfile,
  coreGetContract,
  coreListContracts,
  coreSaveBusinessProfile,
  coreSaveContract,
  type CoreDeps,
} from "./contracts.core";

// Every action goes through the gated core; the gate runs before any database access.
async function deps(context: { supabase: unknown; userId: string }): Promise<CoreDeps> {
  const { requireContractBuilder } = await import("./contract-access.server");
  return { db: context.supabase, userId: context.userId, gate: requireContractBuilder };
}

export const getBusinessProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => coreGetBusinessProfile(await deps(context)));

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
  .handler(async ({ data, context }) => coreSaveBusinessProfile(await deps(context), data));

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => coreListContracts(await deps(context)));

export const getContract = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => coreGetContract(await deps(context), data));

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
  .handler(async ({ data, context }) => coreSaveContract(await deps(context), data));

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => coreDeleteContract(await deps(context), data));
