// WAM staging checkout server functions. Never trusts browser price, rate,
// currency, amount, provider reference or payment status.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADD_ONS, type AddOnId, type BillingPeriod, type PlanId, type SelectedAddOn } from "./plans";

const PLAN_IDS: PlanId[] = ["starter", "growth", "pro", "institutional"];
const ADDON_IDS = ADD_ONS.map((a) => a.id) as string[];

type Selection = { planId?: string; billingPeriod?: string; addons?: { id?: string; quantity?: number }[] };

function parseSelection(data: Selection) {
  if (!PLAN_IDS.includes(data?.planId as PlanId)) throw new Error("Choose a valid plan.");
  const billingPeriod: BillingPeriod = data?.billingPeriod === "monthly" ? "monthly" : "yearly";
  const addons: SelectedAddOn[] = (Array.isArray(data?.addons) ? data.addons : [])
    .filter((a) => ADDON_IDS.includes(a?.id ?? ""))
    .map((a) => ({ id: a.id as AddOnId, quantity: Math.max(1, Math.min(50, Math.floor(Number(a.quantity) || 1))) }));
  return { planId: data.planId as PlanId, billingPeriod, addons };
}

async function readRate() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { WAM_RATE_SETTING_KEY } = await import("./wam-checkout.core");
  const { data } = await supabaseAdmin
    .from("integration_settings")
    .select("value")
    .eq("key", WAM_RATE_SETTING_KEY)
    .maybeSingle();
  return data?.value ?? null;
}

/** Staging access: Super Admin only, and only while WAM is configured for staging. */
async function isStagingTester(context: { supabase: any; userId: string }) {
  const env = String(process.env.WAM_ENVIRONMENT ?? "").trim().toLowerCase();
  if (env !== "staging") return false;
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  return !error && data === true;
}

/** Tells the pricing page whether to show the staging card checkout. */
export const getWamCheckoutAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ available: await isStagingTester(context) }));

/** Read-only server quote for the disclosure panel. Creates nothing. */
export const previewWamCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Selection) => parseSelection(data))
  .handler(async ({ data, context }) => {
    const run = await import("./wam-checkout-run");
    if (!(await isStagingTester(context))) throw new Error(run.CHECKOUT_UNAVAILABLE);
    const core = await import("./wam-checkout.core");
    try {
      const q = await run.quoteWamCheckout({ readRate }, data);
      return {
        planName: q.price.planName, billingPeriod: q.price.billingPeriod, usdTotal: q.price.total,
        exchangeRate: q.rate.text, ttdAmount: core.centsToDecimal(q.ttdCents),
      };
    } catch (e) {
      if (e instanceof core.WamRateUnavailableError) throw new Error("Card checkout is temporarily unavailable.");
      throw e;
    }
  });

/** Creates (or reuses an identical) pending WAM order and its hosted payment intent. */
export const createWamCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Selection) => parseSelection(data))
  .handler(async ({ data, context }) => {
    const { createHash } = await import("crypto");
    const { runWamCheckout } = await import("./wam-checkout-run");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createWamClient } = await import("./wam.server");
    const { ensureUserWorkspaceId } = await import("./workspace.server");
    const { trustedInviteOrigin } = await import("./invitation-links");
    const { getRequestHeader } = await import("@tanstack/react-start/server");

    return runWamCheckout(
      {
        userId: context.userId,
        origin: trustedInviteOrigin(getRequestHeader("origin") ?? null),
        isStagingTester: () => isStagingTester(context),
        readRate,
        workspaceId: () => ensureUserWorkspaceId(context.userId),
        sha256: (t) => createHash("sha256").update(t).digest("hex"),
        newId: () => crypto.randomUUID(),
        now: () => new Date(),
        async findCandidates(fingerprint) {
          const { data: rows } = await supabaseAdmin
            .from("plan_orders").select("*")
            .eq("user_id", context.userId).eq("payment_provider", "wam").eq("quote_fingerprint", fingerprint)
            .order("created_at", { ascending: false }).limit(5);
          return rows ?? [];
        },
        async insertOrder(row) {
          const { data: r, error } = await supabaseAdmin.from("plan_orders").insert(row as never).select("*").single();
          return error ? null : r;
        },
        async createIntent(input) {
          const i = await createWamClient().createPaymentIntent(input);
          return { paymentId: i.paymentId, checkoutUrl: i.checkoutUrl, amountCents: i.amountCents, currency: String(i.currency), status: String(i.status) };
        },
        async markOrder(orderId, patch) {
          await supabaseAdmin.from("plan_orders").update(patch as never).eq("id", orderId);
        },
      },
      data,
    );
  });

/** Passive, owner-only order status for the result page. Never activates. */
export const getWamOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId?: string }) => {
    const id = String(data?.orderId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid order.");
    return { orderId: id };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("plan_orders")
      .select("id, payment_status, payment_currency, payment_amount, total_amount, currency, access_expiry_date")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .eq("payment_provider", "wam")
      .maybeSingle();
    if (!row) return { found: false as const };
    return {
      found: true as const,
      status: row.payment_status,
      usdTotal: Number(row.total_amount),
      ttdAmount: row.payment_amount != null ? Number(row.payment_amount).toFixed(2) : null,
      accessExpiry: row.access_expiry_date,
    };
  });

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
  if (error || !data) throw new Error("Forbidden");
}

export const getWamCheckoutRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { parseRate } = await import("./wam-checkout.core");
    const value = await readRate();
    return { value, valid: parseRate(value) != null };
  });

/** Super Admin only; every change is appended to wam_rate_changes. */
export const setWamCheckoutRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rate?: string; reason?: string }) => {
    const reason = String(data?.reason ?? "").trim().slice(0, 500);
    if (!reason) throw new Error("A reason is required for a rate change.");
    return { rate: String(data?.rate ?? "").trim(), reason };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { parseRate, WAM_RATE_SETTING_KEY } = await import("./wam-checkout.core");
    if (!parseRate(data.rate)) throw new Error("Enter a positive rate with at most 4 decimals.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const old = await readRate();
    const { error: auditErr } = await supabaseAdmin.from("wam_rate_changes").insert({
      setting_key: WAM_RATE_SETTING_KEY,
      old_value: old,
      new_value: data.rate,
      changed_by: context.userId,
      reason: data.reason,
    });
    if (auditErr) throw new Error("Rate change could not be audited; nothing was changed.");
    const { error } = await supabaseAdmin
      .from("integration_settings")
      .upsert({ key: WAM_RATE_SETTING_KEY, value: data.rate, updated_by: context.userId }, { onConflict: "key" });
    if (error) throw new Error("Rate could not be saved.");
    return { ok: true, value: data.rate };
  });
