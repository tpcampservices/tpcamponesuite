import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Super-admin CRM status tooling (Phase 1). No HubSpot requests are made —
 * HubSpot is not connected yet. Every handler verifies platform super_admin
 * through the caller's own session before loading any privileged module.
 */
async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

const uuid = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error("A valid user is required");
  return s;
};

async function audit(context: any, userId: string, action: string, details: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_access_audit").insert({
    actor_user_id: context.userId,
    actor_email: context.claims?.email ?? null,
    target_user_id: userId,
    action,
    reason: "CRM (HubSpot) — manual action",
    details: details as never,
  });
}

export const HUBSPOT_CONNECTED = true;

export const getCrmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string }) => ({ userId: uuid(d?.userId) }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { readCrmState } = await import("./crm.server");
    return { connected: HUBSPOT_CONNECTED, state: await readCrmState(data.userId) };
  });

/** Builds the allow-listed payload for review. Nothing is sent anywhere. */
export const previewCrmPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string }) => ({ userId: uuid(d?.userId) }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { buildCrmPayload } = await import("./crm.server");
    const { payload, hash } = await buildCrmPayload(data.userId);
    return { payload, hash, sent: false as const };
  });

type Action = "pending" | "failed" | "success" | "retry";

export const updateCrmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string; action?: string; error?: string; externalContactId?: string }) => {
    const action = d?.action as Action;
    if (!["pending", "failed", "success", "retry"].includes(action)) throw new Error("Unknown CRM action");
    const externalContactId = String(d?.externalContactId ?? "").trim().slice(0, 64);
    if (action === "success" && !/^[A-Za-z0-9_-]+$/.test(externalContactId)) {
      throw new Error("A CRM contact id is required to record a successful sync");
    }
    return {
      userId: uuid(d?.userId),
      action,
      error: String(d?.error ?? "").trim().slice(0, 1000) || "Unspecified error",
      externalContactId,
    };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const crm = await import("./crm.server");
    let state;
    if (data.action === "pending") {
      state = await crm.markCrmPending(data.userId);
      await audit(context, data.userId, "crm_sync_queued", { status: state.status });
    } else if (data.action === "failed") {
      state = await crm.recordCrmError(data.userId, data.error);
      await audit(context, data.userId, "crm_sync_failed", { error: data.error });
    } else if (data.action === "success") {
      const before = await crm.readCrmState(data.userId);
      state = await crm.recordCrmSuccess(data.userId, data.externalContactId);
      await audit(context, data.userId, "crm_sync_success", { external_contact_id: data.externalContactId });
      if (before.externalContactId !== data.externalContactId) {
        await audit(context, data.userId, "crm_contact_linked", { external_contact_id: data.externalContactId });
      }
    } else {
      state = await crm.prepareCrmRetry(data.userId);
      await audit(context, data.userId, "crm_sync_retry", { attempts: state.attempts });
    }
    return { ok: true as const, state };
  });

const HUBSPOT_TEST_KEY = "hubspot_last_test_ok_at";

/** Read-only HubSpot connection status + test. Never returns credentials. */
export const testHubSpotConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { run?: boolean } | undefined) => ({ run: Boolean(d?.run) }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const hubspot = await import("./hubspot.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const connected = hubspot.hubspotConfigured();
    const { data: row } = await supabaseAdmin
      .from("integration_settings")
      .select("value")
      .eq("key", HUBSPOT_TEST_KEY)
      .maybeSingle();
    let lastOkAt = row?.value ?? null;
    if (!data.run || !connected) {
      return { connected, tested: false, ok: null as boolean | null, lastOkAt, missingProperties: null as string[] | null, error: null as string | null };
    }
    try {
      const res = await hubspot.testConnection();
      lastOkAt = new Date().toISOString();
      await supabaseAdmin
        .from("integration_settings")
        .upsert({ key: HUBSPOT_TEST_KEY, value: lastOkAt, updated_by: context.userId }, { onConflict: "key" });
      return { connected, tested: true, ok: true, lastOkAt, missingProperties: res.missingProperties, error: null };
    } catch (e) {
      const msg = e instanceof hubspot.HubSpotError ? `${e.status} ${e.category}` : "Connection test failed";
      return { connected, tested: true, ok: false, lastOkAt, missingProperties: null, error: msg };
    }
  });

/** Creates only missing TP-CAMP custom contact properties in HubSpot. */
export const ensureHubSpotProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const hubspot = await import("./hubspot.server");
    return hubspot.ensureCustomProperties();
  });

/** Preview with HubSpot property mapping, skipped fields and missing properties. Nothing sent. */
export const previewHubSpotMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string }) => ({ userId: uuid(d?.userId) }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { buildCrmPayload, ambiguityMessage } = await import("./crm.server");
    const hubspot = await import("./hubspot.server");
    const { payload, workspace } = await buildCrmPayload(data.userId);
    const { skipped } = hubspot.toHubSpotProperties(payload);
    let missing: string[] | null = null;
    if (hubspot.hubspotConfigured()) missing = await hubspot.missingCustomProperties().catch(() => null);
    const rows = Object.entries(hubspot.HUBSPOT_PROPERTY_MAP).map(([field, property]) => ({
      field,
      property,
      value: (payload as Record<string, unknown>)[field] ?? null,
      skipped: skipped.includes(field),
      missingInHubSpot: missing ? missing.includes(property) : null,
    }));
    return {
      rows,
      missingProperties: missing,
      workspaceKind: workspace.kind,
      workspaceWarning: workspace.kind === "ambiguous" ? ambiguityMessage(workspace) : null,
      sent: false as const,
    };
  });

/** Manual one-account sync / retry. Super admin only; no bulk, no automation. */
export const syncToHubSpot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string; retry?: boolean }) => ({ userId: uuid(d?.userId), retry: Boolean(d?.retry) }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { syncCrmContact } = await import("./crm.server");
    await audit(context, data.userId, data.retry ? "crm_sync_retry" : "crm_sync_queued", {});
    const res = await syncCrmContact(data.userId);
    if (res.ok) {
      await audit(context, data.userId, "crm_sync_success", {
        external_contact_id: res.state.externalContactId,
        outcome: res.outcome,
      });
      if (res.previousId !== res.state.externalContactId) {
        await audit(context, data.userId, "crm_contact_linked", {
          external_contact_id: res.state.externalContactId,
          previous_contact_id: res.previousId,
        });
      }
      return { ok: true as const, outcome: res.outcome, state: res.state };
    }
    await audit(context, data.userId, "crm_sync_failed", { error: res.error });
    return { ok: false as const, error: res.error, state: res.state };
  });
