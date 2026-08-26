import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Trash2, Plug } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  getIntegrationStatus,
  saveIntegrationSettings,
  deleteIntegrationSetting,
  testPaypalConnection,
  listPaypalPlans,
  savePaypalPlan,
  deletePaypalPlan,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "PayPal Settings — TP-CAMP OneSuite Admin" },
      {
        name: "description",
        content:
          "Securely store TP-CAMP PayPal API credentials and map PayPal plan ids to suite access tiers.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite — PayPal settings" },
      { property: "og:description", content: "Admin settings for PayPal credentials and plan mapping." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminSettingsPage,
});

const FIELDS = [
  {
    key: "PAYPAL_CLIENT_ID" as const,
    label: "PayPal Client ID",
    hint: "Apps & Credentials → your live app → Client ID",
  },
  {
    key: "PAYPAL_CLIENT_SECRET" as const,
    label: "PayPal Client Secret",
    hint: "Same app → Secret. Stored server-side only; never shown again.",
  },
  {
    key: "PAYPAL_WEBHOOK_ID" as const,
    label: "PayPal Webhook ID",
    hint: "Webhooks → the webhook pointing at the URL below.",
  },
];

function AdminSettingsPage() {
  const fetchStatus = useServerFn(getIntegrationStatus);
  const save = useServerFn(saveIntegrationSettings);
  const removeSetting = useServerFn(deleteIntegrationSetting);
  const testConnection = useServerFn(testPaypalConnection);
  const fetchPlans = useServerFn(listPaypalPlans);
  const savePlan = useServerFn(savePaypalPlan);
  const removePlan = useServerFn(deletePaypalPlan);
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [planForm, setPlanForm] = useState({
    planId: "",
    tier: 3,
    cycle: "yearly",
    currency: "USD",
    amount: "",
    label: "",
  });

  const status = useQuery({ queryKey: ["integration-status"], queryFn: () => fetchStatus() });
  const plans = useQuery({ queryKey: ["paypal-plans"], queryFn: () => fetchPlans() });

  const forbidden =
    status.error instanceof Error && status.error.message.includes("Forbidden");

  async function handleSave() {
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim().length),
    );
    if (!Object.keys(payload).length) {
      toast.error("Nothing to save.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: payload });
      setValues({});
      toast.success("Credentials saved securely.");
      queryClient.invalidateQueries({ queryKey: ["integration-status"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      const result = await testConnection(undefined);
      if (result.ok) toast.success("PayPal accepted these credentials.");
      else toast.error("PayPal rejected the credentials or they're incomplete.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePlan() {
    setBusy(true);
    try {
      await savePlan({
        data: {
          planId: planForm.planId,
          tier: Number(planForm.tier),
          cycle: planForm.cycle,
          currency: planForm.currency,
          amount: planForm.amount ? Number(planForm.amount) : undefined,
          label: planForm.label,
        },
      });
      setPlanForm({ planId: "", tier: 3, cycle: "yearly", currency: "USD", amount: "", label: "" });
      toast.success("Plan mapping saved.");
      queryClient.invalidateQueries({ queryKey: ["paypal-plans"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 pt-24 pb-16">
          <h1 className="text-3xl font-semibold">Admin only</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This screen is restricted to super admins.
          </p>
          <Link to="/dashboard" className="mt-6 inline-block text-sm text-accent">
            Back to dashboard
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pt-16 pb-16">
        <p className="eyebrow">Admin · Integrations</p>
        <h1 className="mt-4 text-4xl font-semibold">PayPal settings</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Credentials are written to a server-only store. They are never sent back to the browser —
          you'll only ever see a masked preview.
        </p>

        <section className="panel mt-8 p-7">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="h-4 w-4 text-accent" /> API credentials
          </h2>

          <div className="mt-6 space-y-6">
            {FIELDS.map((field) => {
              const current = status.data?.settings.find((s) => s.key === field.key);
              return (
                <div key={field.key}>
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {field.label}
                    {current?.source === "environment" && (
                      <span className="rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent">
                        set in environment
                      </span>
                    )}
                    {current?.source === "saved" && (
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {current.preview}
                      </span>
                    )}
                    {current?.source === "missing" && (
                      <span className="rounded-full border border-destructive/50 px-2 py-0.5 text-xs text-destructive">
                        not set
                      </span>
                    )}
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={current?.source === "missing" ? "Paste value" : "Replace value"}
                      className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
                    />
                    {current?.source === "saved" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          await removeSetting({ data: { key: field.key } });
                          queryClient.invalidateQueries({ queryKey: ["integration-status"] });
                          toast.success("Removed.");
                        }}
                        className="rounded-lg border border-destructive/50 px-3 text-destructive transition-colors hover:bg-destructive/10"
                        aria-label={`Remove ${field.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{field.hint}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={busy}
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Working…" : "Save credentials"}
            </button>
            <button
              onClick={handleTest}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium transition-colors hover:border-accent/60 disabled:opacity-60"
            >
              <Plug className="h-4 w-4" /> Test connection
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="inline-flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-accent" /> Webhook URL
            </p>
            <p className="mt-1.5 font-mono text-xs break-all text-muted-foreground">
              {status.data?.webhookUrl}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Subscribe it to the BILLING.SUBSCRIPTION.* and PAYMENT.SALE.* events, then paste the
              webhook id above.
            </p>
          </div>
        </section>

        <section className="panel mt-8 p-7">
          <h2 className="text-lg font-semibold">Plan id → access mapping</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each PayPal plan id maps to the tier it unlocks. Webhooks and login sync use this table,
            so upgrades and downgrades land on the right access level.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Plan id</th>
                  <th className="py-2 pr-4 font-medium">Tier</th>
                  <th className="py-2 pr-4 font-medium">Cycle</th>
                  <th className="py-2 pr-4 font-medium">Price</th>
                  <th className="py-2 pr-4 font-medium">Label</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(plans.data?.plans ?? []).map((p) => (
                  <tr key={p.plan_id} className="border-t border-border/70">
                    <td className="py-2.5 pr-4 font-mono text-xs">{p.plan_id}</td>
                    <td className="py-2.5 pr-4">Tier {p.tier}</td>
                    <td className="py-2.5 pr-4 capitalize">{p.cycle}</td>
                    <td className="py-2.5 pr-4">
                      {p.amount === null ? "—" : `${p.currency} $${Number(p.amount).toLocaleString()}`}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{p.label ?? "—"}</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={async () => {
                          await removePlan({ data: { planId: p.plan_id } });
                          queryClient.invalidateQueries({ queryKey: ["paypal-plans"] });
                          toast.success("Mapping removed.");
                        }}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {!plans.data?.plans.length && (
                  <tr>
                    <td colSpan={6} className="py-3 text-sm text-muted-foreground">
                      No plan mappings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={planForm.planId}
              onChange={(e) => setPlanForm({ ...planForm, planId: e.target.value })}
              placeholder="P-XXXXXXXX"
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            />
            <select
              value={planForm.tier}
              onChange={(e) => setPlanForm({ ...planForm, tier: Number(e.target.value) })}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            >
              <option value={1}>Tier 1</option>
              <option value={2}>Tier 2</option>
              <option value={3}>Tier 3 — full suite</option>
            </select>
            <select
              value={planForm.cycle}
              onChange={(e) => setPlanForm({ ...planForm, cycle: e.target.value })}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <select
              value={planForm.currency}
              onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            >
              <option value="USD">USD</option>
              <option value="TTD">TTD</option>
            </select>
            <input
              value={planForm.amount}
              onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })}
              placeholder="Amount"
              inputMode="decimal"
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            />
            <input
              value={planForm.label}
              onChange={(e) => setPlanForm({ ...planForm, label: e.target.value })}
              placeholder="Label (optional)"
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            />
          </div>
          <button
            onClick={handleSavePlan}
            disabled={busy}
            className="mt-4 rounded-lg border border-border px-5 py-3 text-sm font-medium transition-colors hover:border-accent/60 disabled:opacity-60"
          >
            Save plan mapping
          </button>
        </section>

        <Link to="/admin/webhooks" className="mt-8 inline-block text-sm text-accent">
          View webhook event log →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
