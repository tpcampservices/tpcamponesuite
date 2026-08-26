import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETTING_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

function mask(value: string) {
  const v = value.trim();
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

/** Masked status of the PayPal credentials — never returns raw secret values. */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("integration_settings")
      .select("key, value, updated_at");

    const byKey = new Map((rows ?? []).map((r) => [r.key, r]));

    const settings = SETTING_KEYS.map((key) => {
      const fromEnv = Boolean(process.env[key]);
      const row = byKey.get(key);
      const stored = (row?.value ?? "").trim();
      return {
        key,
        source: fromEnv ? ("environment" as const) : stored ? ("saved" as const) : ("missing" as const),
        preview: fromEnv ? "•••• (environment secret)" : stored ? mask(stored) : null,
        updatedAt: (row?.updated_at as string | undefined) ?? null,
      };
    });

    return {
      settings,
      ready: settings.every((s) => s.source !== "missing"),
      webhookUrl: "https://tpcamponesuite.app/api/public/paypal/webhook",
    };
  });

export const saveIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<Record<SettingKey, string>>) => {
    const out: Partial<Record<SettingKey, string>> = {};
    for (const key of SETTING_KEYS) {
      const raw = data?.[key];
      if (typeof raw === "string" && raw.trim().length) out[key] = raw.trim().slice(0, 500);
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const keys = Object.keys(data) as SettingKey[];
    if (!keys.length) return { ok: true as const, saved: [] as string[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_settings").upsert(
      keys.map((key) => ({
        key,
        value: data[key] as string,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, saved: keys };
  });

export const deleteIntegrationSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { key?: string }) => ({
    key: SETTING_KEYS.includes(data?.key as SettingKey) ? (data.key as SettingKey) : null,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (!data.key) throw new Error("Unknown setting");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_settings").delete().eq("key", data.key);
    return { ok: true as const };
  });

/** Live credential check against PayPal (token request only, no data returned). */
export const testPaypalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { paypalAccessToken } = await import("./subscription.server");
    const token = await paypalAccessToken();
    return { ok: Boolean(token) };
  });

export const listWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await context.supabase
      .from("paypal_webhook_events")
      .select(
        "id, event_id, event_type, subscription_reference, plan_id, previous_status, new_status, applied, duplicate, note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { events: data ?? [] };
  });

export const listPaypalPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await context.supabase
      .from("paypal_plans")
      .select("plan_id, tier, cycle, currency, amount, label, active, updated_at")
      .order("tier", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  });

export const savePaypalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      planId?: string;
      tier?: number;
      cycle?: string;
      currency?: string;
      amount?: number;
      label?: string;
      active?: boolean;
    }) => {
      const planId = (data?.planId ?? "").trim().slice(0, 120);
      if (!planId) throw new Error("A PayPal plan id is required");
      const tier = Math.min(3, Math.max(1, Number(data?.tier ?? 3)));
      return {
        planId,
        tier,
        cycle: data?.cycle === "monthly" ? "monthly" : "yearly",
        currency: data?.currency === "TTD" ? "TTD" : "USD",
        amount: Number.isFinite(Number(data?.amount)) ? Number(data?.amount) : null,
        label: (data?.label ?? "").trim().slice(0, 160) || null,
        active: data?.active !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("paypal_plans").upsert(
      {
        plan_id: data.planId,
        tier: data.tier,
        cycle: data.cycle,
        currency: data.currency,
        amount: data.amount,
        label: data.label,
        active: data.active,
      },
      { onConflict: "plan_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePaypalPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { planId?: string }) => ({
    planId: (data?.planId ?? "").trim().slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (!data.planId) throw new Error("Missing plan id");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("paypal_plans").delete().eq("plan_id", data.planId);
    return { ok: true as const };
  });
