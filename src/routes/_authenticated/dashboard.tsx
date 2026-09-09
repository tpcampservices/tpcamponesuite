import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Lock,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { suiteApps, BETA_LABEL } from "@/lib/tiers";
import { getMyAccount } from "@/lib/account.functions";
import { getAccessState } from "@/lib/billing.functions";
import { activeReminder, daysUntil, formatMoney, type Currency } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your TP-CAMP OneSuite Dashboard — Access & Apps" },
      {
        name: "description",
        content:
          "Manage your TP-CAMP OneSuite access period, renew manually and open every application included in your plan.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Dashboard" },
      { property: "og:description", content: "Access status, billing history and app links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const formatDate = (value: string | number) =>
  new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function DashboardPage() {
  const fetchAccount = useServerFn(getMyAccount);
  const fetchAccess = useServerFn(getAccessState);

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: () => fetchAccount() });
  const { data, isLoading } = useQuery({ queryKey: ["access-state"], queryFn: () => fetchAccess({}) });

  const isSuperAdmin = Boolean(account?.isSuperAdmin);
  const entitlement = data?.entitlement ?? null;
  const orders = data?.orders ?? [];
  const usage = data?.usage ?? [];

  const hasAccess = isSuperAdmin || entitlement?.status === "active";
  const expired = entitlement?.status === "expired";
  const remaining = daysUntil(entitlement?.expiryDate);
  const reminder =
    entitlement?.status === "active"
      ? activeReminder(entitlement.expiryDate, entitlement.billingPeriod)
      : null;

  const statusLabel = isSuperAdmin
    ? "Active (super admin)"
    : entitlement?.status === "active"
      ? "Active"
      : expired
        ? "Expired — renew to restore access"
        : "No access period yet";
  const statusTone: "good" | "warn" | "muted" = hasAccess ? "good" : expired ? "warn" : "muted";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">{BETA_LABEL} · Your account</p>
        <h1 className="mt-4 text-4xl font-semibold">Dashboard</h1>
        {isSuperAdmin && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-1.5 text-sm text-accent">
            <ShieldCheck className="h-4 w-4" /> Super admin — full suite unlocked
          </p>
        )}

        {/* Access state strip — the same status every suite app reads */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">Plan</span>
            <strong className="font-medium">
              {isSuperAdmin ? "All plans" : (entitlement?.planName ?? "None")}
            </strong>
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm ${
              statusTone === "good"
                ? "border-accent/50 text-accent"
                : statusTone === "warn"
                  ? "border-destructive/50 text-destructive"
                  : "border-border text-muted-foreground"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {statusLabel}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm">
            <CalendarClock className="h-4 w-4 text-accent" />
            <span className="text-muted-foreground">Access expires</span>
            <strong className="font-medium">
              {entitlement?.expiryDate ? formatDate(entitlement.expiryDate) : "—"}
            </strong>
          </span>
          {isSuperAdmin && (
            <>
              <Link
                to="/admin/settings"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-accent/60"
              >
                PayPal settings
              </Link>
              <Link
                to="/admin/webhooks"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-accent/60"
              >
                Webhook log
              </Link>
            </>
          )}
        </div>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading your access…</p>}

        {reminder && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
            <p className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-accent" />
              {reminder.message}
            </p>
            <Link
              to="/pricing"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Renew now
            </Link>
          </div>
        )}

        {expired && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              Your access period ended{" "}
              {entitlement?.expiryDate ? `on ${formatDate(entitlement.expiryDate)}` : ""}. Your data
              is safe — renew to unlock the apps again.
            </p>
            <Link
              to="/pricing"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Renew access
            </Link>
          </div>
        )}

        <section className="panel mt-8 p-7">
          <h2 className="text-lg font-semibold">Access &amp; billing</h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Access status</p>
              <p className="mt-2 text-sm">{statusLabel}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Access period</p>
              <p className="mt-2 text-sm">
                {entitlement?.startDate ? formatDate(entitlement.startDate) : "—"} →{" "}
                {entitlement?.expiryDate ? formatDate(entitlement.expiryDate) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Days remaining</p>
              <p className="mt-2 text-sm">
                {remaining !== null && remaining > 0 ? `${remaining} days` : hasAccess ? "—" : "0"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Apps unlocked</p>
              <p className="mt-2 text-sm">{hasAccess ? `All ${suiteApps.length} apps` : "None yet"}</p>
            </div>
          </div>

          {entitlement?.planId && (
            <>
              <h3 className="mt-8 text-sm font-semibold">Plan allowances</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {usage.map((u) => (
                  <div key={u.metric} className="rounded-lg border border-border bg-surface p-4">
                    <p className="text-xs text-muted-foreground">{u.label}</p>
                    <p className="mt-1 text-sm">
                      <strong>{u.used.toLocaleString()}</strong> / {u.limit.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-accent" /> Payment history &amp; receipts
          </h3>
          {orders.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No payments yet. Choose a plan to activate your first access period.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Access period</th>
                    <th className="py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-border/70">
                      <td className="py-2.5 pr-4">{formatDate(o.paidAt ?? o.createdAt)}</td>
                      <td className="py-2.5 pr-4 capitalize">
                        {o.planId} · {o.billingPeriod === "monthly" ? "1 month" : "12 months"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {formatMoney(o.currency as Currency, o.total)}
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{o.status}</td>
                      <td className="py-2.5 pr-4">
                        {o.accessStart && o.accessExpiry
                          ? `${formatDate(o.accessStart)} → ${formatDate(o.accessExpiry)}`
                          : "—"}
                      </td>
                      <td className="py-2.5 font-mono text-xs break-all text-muted-foreground">
                        {o.reference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted-foreground">
              TP-CAMP never charges you automatically. Renew early and any unused days are added on
              top of your new period.
            </p>
            <Link
              to="/pricing"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/60"
            >
              {hasAccess ? "Renew or change plan" : "Choose a plan"}
            </Link>
          </div>
        </section>

        <section className="panel mt-8 flex flex-wrap items-center justify-between gap-5 p-7">
          <div>
            <h2 className="text-lg font-semibold">Contract builder</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Generate Trinidad and Tobago agreements from seven vetted templates, pre-filled from
              your business profile.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/business-profile"
              className="rounded-lg border border-border px-5 py-3 text-sm font-medium transition-colors hover:border-accent/60"
            >
              Business profile
            </Link>
            <Link
              to="/contracts"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Open contract builder <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <h2 className="mt-10 text-lg font-semibold">Your applications</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suiteApps.map((app) =>
            hasAccess ? (
              <a
                key={app.url}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-4 transition-colors hover:border-accent/60"
              >
                <span>
                  <span className="block text-sm font-medium">{app.name}</span>
                  <span className="block text-xs text-muted-foreground">{app.blurb}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
              </a>
            ) : (
              <div
                key={app.url}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/50 px-4 py-4 opacity-70"
              >
                <span>
                  <span className="block text-sm font-medium">{app.name}</span>
                  <span className="block text-xs text-muted-foreground">{app.blurb}</span>
                </span>
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ),
          )}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Want the full feature list?{" "}
          <Link to="/compare" className="text-accent">
            See everything included
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
