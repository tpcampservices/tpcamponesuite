import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE_KEYS = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;
type BaseKey = (typeof BASE_KEYS)[number];
type Environment = "sandbox" | "live";
const ENVIRONMENTS: Environment[] = ["sandbox", "live"];

const SETTING_KEYS = ENVIRONMENTS.flatMap((env) =>
  BASE_KEYS.map((k) => `${k}_${env.toUpperCase()}`),
) as string[];
const ENV_KEY = "PAYPAL_ENVIRONMENT";

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
    const { getPaypalEnvironment, paypalApiBaseFor } = await import("./subscription.server");

    const { data: rows } = await supabaseAdmin
      .from("integration_settings")
      .select("key, value, updated_at");

    const byKey = new Map((rows ?? []).map((r) => [r.key, r]));
    const environment = await getPaypalEnvironment();

    const settings = ENVIRONMENTS.flatMap((env) =>
      BASE_KEYS.map((base) => {
        const key = `${base}_${env.toUpperCase()}`;
        const legacy = env === "live" ? byKey.get(base) : undefined;
        const fromEnv = Boolean(process.env[key] || (env === "live" && process.env[base]));
        const row = byKey.get(key) ?? legacy;
        const stored = (row?.value ?? "").trim();
        return {
          key,
          base,
          environment: env,
          source: fromEnv
            ? ("environment" as const)
            : stored
              ? ("saved" as const)
              : ("missing" as const),
          preview: fromEnv ? "•••• (environment secret)" : stored ? mask(stored) : null,
          updatedAt: (row?.updated_at as string | undefined) ?? null,
        };
      }),
    );

    const current = settings.filter((s) => s.environment === environment);

    return {
      environment,
      apiBase: paypalApiBaseFor(environment),
      settings,
      ready: current.every((s) => s.source !== "missing"),
      webhookUrl: "https://tpcamponesuite.app/api/public/paypal/webhook",
    };
  });

export const setPaypalEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment?: string }) => ({
    environment: (data?.environment === "live" ? "live" : "sandbox") as Environment,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_settings").upsert(
      {
        key: ENV_KEY,
        value: data.environment,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, environment: data.environment };
  });

export const saveIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const key of SETTING_KEYS) {
      const raw = data?.[key];
      if (typeof raw === "string" && raw.trim().length) out[key] = raw.trim().slice(0, 500);
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const keys = Object.keys(data);
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
    key: SETTING_KEYS.includes(data?.key ?? "") ? (data.key as string) : null,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (!data.key) throw new Error("Unknown setting");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("integration_settings").delete().eq("key", data.key);
    return { ok: true as const };
  });

/**
 * Live credential check against the SELECTED PayPal environment.
 * Requests an OAuth2 client-credentials token; no secret ever leaves the server.
 */
export const testPaypalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment?: string } | undefined) => ({
    environment:
      data?.environment === "live" || data?.environment === "sandbox"
        ? (data.environment as Environment)
        : undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { getPaypalCredentials, requestPaypalToken } = await import("./subscription.server");
    const creds = await getPaypalCredentials(data.environment);
    const result = await requestPaypalToken(data.environment);

    return {
      ok: result.ok,
      environment: creds.environment,
      apiBase: creds.apiBase,
      clientIdPresent: Boolean(creds.clientId),
      clientSecretPresent: Boolean(creds.clientSecret),
      webhookIdConfigured: Boolean(creds.webhookId),
      oauth: result.ok ? ("passed" as const) : ("failed" as const),
      status: result.ok ? 200 : result.status,
      error: result.ok ? null : result.error,
      message: result.ok ? null : result.message,
      debugId: result.ok ? null : result.debugId,
    };
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
        currency: "USD",
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
