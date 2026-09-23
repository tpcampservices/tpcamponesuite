/**
 * Server-only HubSpot CRM client (Phase 2). Calls go through the connector
 * gateway; credentials are read from the server environment inside each call
 * and are never returned, logged or sent to the browser.
 *
 * HubSpot is write-mostly: nothing read from HubSpot ever changes TP-CAMP
 * access, plans, entitlements, roles or payments.
 */
import type { CrmField, CrmPayload } from "./crm.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/hubspot";
const V = "2026-09";
const path = {
  contacts: `/crm/objects/${V}/contacts`,
  contact: (id: string) => `/crm/objects/${V}/contacts/${encodeURIComponent(id)}`,
  search: `/crm/objects/${V}/contacts/search`,
  properties: `/crm/properties/${V}/contacts`,
  groups: `/crm/properties/${V}/contacts/groups`,
};

export const TPCAMP_PROPERTY_GROUP = "tpcamp";

/** TP-CAMP payload field → HubSpot contact property. Standard props first. */
export const HUBSPOT_PROPERTY_MAP: Record<CrmField, string> = {
  email: "email",
  first_name: "firstname",
  last_name: "lastname",
  contact_phone: "phone",
  country: "country",
  website: "website",
  organisation: "company",
  tpcamp_user_id: "tpcamp_user_id",
  full_name: "tpcamp_full_name",
  last_login_at: "tpcamp_last_login_at",
  signup_date: "tpcamp_signup_date",
  legal_business_name: "tpcamp_legal_business_name",
  trading_name: "tpcamp_trading_name",
  business_registration_number: "tpcamp_business_registration_number",
  business_address: "tpcamp_business_address",
  current_plan: "tpcamp_current_plan",
  subscription_status: "tpcamp_subscription_status",
  payment_status: "tpcamp_payment_status",
  billing_period: "tpcamp_billing_period",
  access_start_date: "tpcamp_access_start_date",
  access_expiry_date: "tpcamp_access_expiry_date",
  subscription_source: "tpcamp_subscription_source",
  workspace_id: "tpcamp_workspace_id",
  workspace_name: "tpcamp_workspace_name",
  workspace_role: "tpcamp_workspace_role",
  seats_limit: "tpcamp_seats_limit",
  seats_used: "tpcamp_seats_used",
  app_catalog_access: "tpcamp_catalog_access",
  app_splits_access: "tpcamp_splits_access",
  app_invoice_access: "tpcamp_invoice_access",
  app_operations_access: "tpcamp_operations_access",
  app_finance_access: "tpcamp_finance_access",
};

/** Custom properties TP-CAMP owns (all plain text, to avoid type coercion errors). */
export const TPCAMP_CUSTOM_PROPERTIES: { name: string; label: string }[] = [
  ["tpcamp_user_id", "TP-CAMP User ID"],
  ["tpcamp_full_name", "TP-CAMP Full Name"],
  ["tpcamp_customer_organisation", "TP-CAMP Organisation"],
  ["tpcamp_legal_business_name", "TP-CAMP Legal Business Name"],
  ["tpcamp_trading_name", "TP-CAMP Trading Name"],
  ["tpcamp_business_registration_number", "TP-CAMP Business Registration Number"],
  ["tpcamp_business_address", "TP-CAMP Business Address"],
  ["tpcamp_signup_date", "TP-CAMP Signup Date"],
  ["tpcamp_last_login_at", "TP-CAMP Last Login"],
  ["tpcamp_current_plan", "TP-CAMP Current Plan"],
  ["tpcamp_subscription_status", "TP-CAMP Subscription Status"],
  ["tpcamp_payment_status", "TP-CAMP Payment Status"],
  ["tpcamp_billing_period", "TP-CAMP Billing Period"],
  ["tpcamp_access_start_date", "TP-CAMP Access Start Date"],
  ["tpcamp_access_expiry_date", "TP-CAMP Access Expiry Date"],
  ["tpcamp_subscription_source", "TP-CAMP Subscription Source"],
  ["tpcamp_workspace_id", "TP-CAMP Workspace ID"],
  ["tpcamp_workspace_name", "TP-CAMP Workspace Name"],
  ["tpcamp_workspace_role", "TP-CAMP Workspace Role"],
  ["tpcamp_seats_limit", "TP-CAMP Seats Limit"],
  ["tpcamp_seats_used", "TP-CAMP Seats Used"],
  ["tpcamp_catalog_access", "TP-CAMP Catalog Access"],
  ["tpcamp_splits_access", "TP-CAMP Splits Access"],
  ["tpcamp_invoice_access", "TP-CAMP Invoice Access"],
  ["tpcamp_operations_access", "TP-CAMP Operations Access"],
  ["tpcamp_finance_access", "TP-CAMP Finance Access"],
].map(([name, label]) => ({ name, label }));

export class HubSpotError extends Error {
  constructor(
    public status: number,
    public category: string,
    message: string,
  ) {
    super(message);
  }
}

export function hubspotConfigured() {
  return Boolean(process.env.LOVABLE_API_KEY && process.env.HUBSPOT_API_KEY);
}

/** Summarises an error body without echoing the full provider response. */
function summarise(status: number, body: string) {
  try {
    const j = JSON.parse(body);
    return { category: String(j.category ?? j.type ?? "ERROR"), message: String(j.message ?? "").slice(0, 300) };
  } catch {
    return { category: "ERROR", message: `HTTP ${status}` };
  }
}

async function hs<T = any>(method: string, p: string, body?: unknown): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const hubspotKey = process.env.HUBSPOT_API_KEY;
  if (!lovableKey || !hubspotKey) throw new HubSpotError(0, "NOT_CONNECTED", "HubSpot is not connected");
  const res = await fetch(`${GATEWAY_URL}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": hubspotKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const s = summarise(res.status, text);
    console.error(`[hubspot] ${method} ${p.split("?")[0]} failed [${res.status}] ${s.category}`);
    throw new HubSpotError(res.status, s.category, s.message || `HubSpot request failed (${res.status})`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Converts the allow-listed payload into HubSpot properties, skipping empty values. */
export function toHubSpotProperties(payload: CrmPayload) {
  const properties: Record<string, string> = {};
  const skipped: string[] = [];
  for (const [field, prop] of Object.entries(HUBSPOT_PROPERTY_MAP) as [CrmField, string][]) {
    const v = payload[field];
    if (v === null || v === undefined || v === "") {
      skipped.push(field);
      continue;
    }
    properties[prop] = String(v);
  }
  if (payload.organisation) properties.tpcamp_customer_organisation = String(payload.organisation);
  return { properties, skipped };
}

/** Read-only connectivity test + which TP-CAMP properties are missing. */
export async function testConnection() {
  await hs("GET", `${path.contacts}?limit=1&properties=email`);
  return { ok: true as const, missingProperties: await missingCustomProperties() };
}

export async function missingCustomProperties(): Promise<string[]> {
  const res = await hs<{ results: { name: string }[] }>("GET", `${path.properties}?archived=false`);
  const existing = new Set((res.results ?? []).map((p) => p.name));
  return TPCAMP_CUSTOM_PROPERTIES.map((p) => p.name).filter((n) => !existing.has(n));
}

/** Creates only missing TP-CAMP properties (never modifies existing ones). */
export async function ensureCustomProperties() {
  const missing = await missingCustomProperties();
  const created: string[] = [];
  const failed: { name: string; reason: string }[] = [];
  if (!missing.length) return { created, failed, missing };
  try {
    await hs("POST", path.groups, { name: TPCAMP_PROPERTY_GROUP, label: "TP-CAMP OneSuite", displayOrder: -1 });
  } catch (e) {
    if (!(e instanceof HubSpotError && e.status === 409)) {
      /* group may already exist or be forbidden; property creation reports clearly below */
    }
  }
  for (const name of missing) {
    const def = TPCAMP_CUSTOM_PROPERTIES.find((p) => p.name === name)!;
    try {
      await hs("POST", path.properties, {
        name: def.name,
        label: def.label,
        type: "string",
        fieldType: "text",
        groupName: TPCAMP_PROPERTY_GROUP,
        description: "Managed by TP-CAMP OneSuite. Read-only reference — TP-CAMP is the source of truth.",
      });
      created.push(name);
    } catch (e) {
      failed.push({ name, reason: e instanceof HubSpotError ? `${e.status} ${e.category}` : "error" });
    }
  }
  return { created, failed, missing: await missingCustomProperties().catch(() => missing) };
}

export async function getContact(id: string): Promise<{ id: string } | null> {
  try {
    return await hs("GET", `${path.contact(id)}?properties=email`);
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 404) return null;
    throw e;
  }
}

export async function findContactByEmail(email: string): Promise<string | null> {
  const res = await hs<{ results: { id: string }[] }>("POST", path.search, {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email"],
    limit: 2,
  });
  return res.results?.[0]?.id ?? null;
}

export async function createContact(properties: Record<string, string>): Promise<string> {
  const res = await hs<{ id: string }>("POST", path.contacts, { properties });
  return res.id;
}

export async function updateContact(id: string, properties: Record<string, string>): Promise<boolean> {
  try {
    await hs("PATCH", path.contact(id), { properties });
    return true;
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 404) return false;
    throw e;
  }
}

/**
 * Dedup-safe upsert:
 * 1. stored id → update; 2. gone → search by email; 3. found → link+update;
 * 4. none → create; a 409 on create (email already exists) → search again and update.
 */
export async function upsertContact(args: {
  storedId: string | null;
  email: string;
  properties: Record<string, string>;
}): Promise<{ id: string; outcome: "updated" | "linked" | "created" | "relinked" }> {
  if (args.storedId && (await updateContact(args.storedId, args.properties))) {
    return { id: args.storedId, outcome: "updated" };
  }
  const found = await findContactByEmail(args.email);
  if (found) {
    await updateContact(found, args.properties);
    return { id: found, outcome: args.storedId ? "relinked" : "linked" };
  }
  try {
    return { id: await createContact(args.properties), outcome: "created" };
  } catch (e) {
    if (e instanceof HubSpotError && e.status === 409) {
      const again = await findContactByEmail(args.email);
      if (again) {
        await updateContact(again, args.properties);
        return { id: again, outcome: "linked" };
      }
    }
    throw e;
  }
}
