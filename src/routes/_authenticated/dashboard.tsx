import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CalendarClock, Lock, Receipt, ShieldCheck } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { plan, suiteApps, BETA_LABEL } from "@/lib/tiers";
import { getMyAccount, startCheckout } from "@/lib/account.functions";
import { cancelMySubscription } from "@/lib/paypal.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your TP-CAMP OneSuite Dashboard — Subscription & Apps" },
      {
        name: "description",
        content:
          "Manage your TP-CAMP OneSuite subscription and open every application included in the suite.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Dashboard" },
      { property: "og:description", content: "Subscription status, billing history and app links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchAccount = useServerFn(getMyAccount);
  const checkout = useServerFn(startCheckout);
  const cancelSub = useServerFn(cancelMySubscription);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [yearly, setYearly] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["account"],
    queryFn: () => fetchAccount(),
  });

  async function handleCheckout() {
    setBusy(true);
    try {
      const result = await checkout({
        data: {
          cycle: yearly ? "yearly" : "monthly",
          currency: "USD",
          returnUrl: window.location.href,
        },
      });
      if (result.configured && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast.success(
        `Order created (ref ${result.reference}). The payment portal isn't linked yet — access unlocks once payment is confirmed.`,
      );
      queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  const subscriptions = data?.subscriptions ?? [];
  const now = Date.now();
  const activeSubs = subscriptions.filter(
    (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
  );
  const hasAccess = Boolean(data?.isSuperAdmin) || activeSubs.length > 0;
  const pending = subscriptions.some((s) => s.status === "pending");

  const renewalDates = activeSubs
    .map((s) => (s.expires_at ? new Date(s.expires_at).getTime() : null))
    .filter((d): d is number => d !== null && d > now)
    .sort((a, b) => a - b);
  const nextBilling = renewalDates[0] ?? null;

  const formatDate = (value: string | number) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  const formatAmount = (amount: number | null, currency: string) =>
    amount === null ? "—" : `${currency} $${Number(amount).toLocaleString()}`;

  const price = yearly ? plan.yearly : plan.monthly;

  const paypalActive = activeSubs.find(
    (s) => s.payment_provider === "paypal" && s.payment_reference,
  );
  const suspended = subscriptions.find(
    (s) => s.payment_provider === "paypal" && s.status === "pending",
  );
  const lapsed = subscriptions.find(
    (s) => s.status === "cancelled" || s.status === "expired",
  );

  async function handleCancel(reference: string) {
    if (
      !window.confirm(
        "Cancel your TP-CAMP OneSuite subscription? Access stays open until the end of the paid period.",
      )
    )
      return;
    setBusy(true);
    try {
      const result = await cancelSub({ data: { subscriptionId: reference } });
      toast.success(
        result.accessUntil
          ? `Subscription cancelled. Access remains until ${formatDate(result.accessUntil)}.`
          : "Subscription cancelled.",
      );
      queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancellation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">{BETA_LABEL} · Your account</p>
        <h1 className="mt-4 text-4xl font-semibold">Dashboard</h1>
        {data?.isSuperAdmin && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-1.5 text-sm text-accent">
            <ShieldCheck className="h-4 w-4" /> Super admin — full suite unlocked
          </p>
        )}

        {/* Access state strip — always visible so every app shows the same status */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">Tier</span>
            <strong className="font-medium">
              {data?.isSuperAdmin ? "Super admin — Tier 3" : accessTier ? `Tier ${accessTier}` : "None"}
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
            <span className="text-muted-foreground">Next billing</span>
            <strong className="font-medium">{nextBilling ? formatDate(nextBilling) : "—"}</strong>
          </span>
          {data?.isSuperAdmin && (
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


        <section className="panel mt-8 p-7">
          <h2 className="text-lg font-semibold">Billing &amp; subscription</h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Subscription status</p>
              <p className="mt-2 text-sm">
                {data?.isSuperAdmin
                  ? "Active (super admin)"
                  : hasAccess
                    ? `${plan.name} — active`
                    : pending
                      ? "Awaiting payment confirmation"
                      : "No active subscription yet"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Next billing date</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-accent" />
                {nextBilling ? formatDate(nextBilling) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="eyebrow">Apps unlocked</p>
              <p className="mt-2 text-sm">
                {hasAccess ? `All ${suiteApps.length} apps` : "None yet"}
              </p>
            </div>
          </div>

          <h3 className="mt-8 inline-flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-accent" /> Payment history &amp; receipts
          </h3>
          {subscriptions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No payments yet. Start your subscription below.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Renews / expires</th>
                    <th className="py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="border-t border-border/70">
                      <td className="py-2.5 pr-4">{formatDate(s.created_at)}</td>
                      <td className="py-2.5 pr-4">
                        {formatAmount(s.amount as number | null, s.currency)}
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{s.status}</td>
                      <td className="py-2.5 pr-4">{s.expires_at ? formatDate(s.expires_at) : "—"}</td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">
                        {s.payment_reference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(suspended || (!hasAccess && lapsed)) && (
            <div className="mt-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p>
                {suspended
                  ? "A PayPal payment for your subscription hasn't cleared. Your suite access is suspended until PayPal confirms the payment — update your payment method in PayPal, or resubscribe below."
                  : "Your subscription is no longer active, so the suite apps are locked. Resubscribe below to restore access."}
              </p>
            </div>
          )}

          {paypalActive?.payment_reference && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-muted-foreground">
                Cancel anytime — your access stays open until
                {" "}
                {paypalActive.expires_at ? formatDate(paypalActive.expires_at) : "the end of the paid period"}.
              </p>
              <button
                onClick={() => handleCancel(paypalActive.payment_reference as string)}
                disabled={busy}
                className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                {busy ? "Working…" : "Cancel subscription"}
              </button>
            </div>
          )}
        </section>

        {!hasAccess && (
          <section className="panel-featured mt-8 p-7">
            <h2 className="text-lg font-semibold">Start your {plan.name} subscription</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              One fee unlocks every tool in the suite. Choose monthly or yearly billing.
            </p>

            <div className="mt-5 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
              <button
                onClick={() => setYearly(false)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  !yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Yearly
              </button>
            </div>

            <p className="mt-5 font-display text-3xl font-semibold">
              ${price.usd.toLocaleString()}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                USD / {yearly ? "year" : "month"} · TTD ${price.ttd.toLocaleString()}
              </span>
            </p>

            <button
              onClick={handleCheckout}
              disabled={busy}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Starting…" : pending ? "Awaiting payment — retry" : "Subscribe"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

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
