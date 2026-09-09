import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Info } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PaypalPayButton } from "@/components/paypal-pay-button";
import { useSession } from "@/hooks/use-session";
import { suiteApps, BETA_LABEL } from "@/lib/tiers";
import { getQuote } from "@/lib/billing.functions";
import {
  ADD_ONS,
  LIMIT_LABELS,
  PLANS,
  formatMoney,
  quotePrice,
  type AddOnId,
  type BillingPeriod,
  type Currency,
  type PlanId,
  type PlanLimits,
} from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite Pricing — Fixed-Term Plans, No Auto-Renewal" },
      {
        name: "description",
        content:
          "Choose Starter, Growth, Pro or Institutional access for TP-CAMP OneSuite. Separate TTD and USD prices, one-time PayPal payment, and you renew manually — never charged automatically.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Pricing" },
      {
        property: "og:description",
        content:
          "Fixed-term access plans paid once by PayPal. No automatic renewals, no surprise charges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { session } = useSession();
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const [currency, setCurrency] = useState<Currency>("TTD");
  const [planId, setPlanId] = useState<PlanId>("starter");
  const [addonQty, setAddonQty] = useState<Record<AddOnId, number>>({
    team_add: 0,
    professional_support: 0,
    onboarding: 0,
  });

  const addons = useMemo(
    () =>
      (Object.entries(addonQty) as [AddOnId, number][])
        .filter(([, q]) => q > 0)
        .map(([id, quantity]) => ({ id, quantity })),
    [addonQty],
  );

  const selection = { planId, billingPeriod: period, currency, addons };

  // Shown immediately from the shared catalogue, then replaced by the
  // backend-authoritative quote once the user is signed in.
  const localQuote = quotePrice(selection);
  const fetchQuote = useServerFn(getQuote);
  const { data: serverQuote } = useQuery({
    queryKey: ["quote", planId, period, currency, JSON.stringify(addons)],
    queryFn: () => fetchQuote({ data: selection }),
    enabled: Boolean(session),
  });
  const quote = serverQuote ?? localQuote;

  const periodLabel = period === "yearly" ? "12 months" : "1 month";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-8">
          <p className="eyebrow">{BETA_LABEL} · Fixed-term access · manual renewal</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl">
            Pay once for the access period you choose.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Every plan is a one-time PayPal payment for a fixed access period. Nothing renews
            automatically and PayPal never charges you again — we remind you before your access ends
            and you renew when you're ready.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
              {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {p === "monthly" ? "1 month" : "12 months"}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
              {(["TTD", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="plan" className="mx-auto max-w-6xl px-5 pb-6">
          <div className="grid gap-5 lg:grid-cols-4">
            {PLANS.map((p) => {
              const selected = p.id === planId;
              return (
                <article
                  key={p.id}
                  className={`${selected || p.highlight ? "panel-featured" : "panel"} flex flex-col p-6`}
                >
                  {p.highlight && (
                    <span className="mb-3 w-fit rounded-full bg-primary px-3 py-1 font-mono text-[0.6rem] tracking-[0.2em] text-primary-foreground uppercase">
                      Most popular
                    </span>
                  )}
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>

                  <div className="mt-5 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-semibold">
                      {formatMoney(currency, p.price[period][currency])}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                    {currency} · {periodLabel} access
                  </p>

                  <ul className="mt-5 space-y-2 text-sm">
                    {(Object.keys(LIMIT_LABELS) as (keyof PlanLimits)[]).map((metric) => (
                      <li key={metric} className="flex gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span className="text-muted-foreground">
                          <span className="text-foreground">
                            {p.limits[metric].toLocaleString()}
                          </span>{" "}
                          {LIMIT_LABELS[metric].toLowerCase()}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setPlanId(p.id)}
                    className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-surface text-foreground"
                    }`}
                  >
                    {selected ? "Selected" : `Choose ${p.name}`}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="grid gap-6 lg:grid-cols-3">
            <article className="panel p-7 lg:col-span-2">
              <p className="eyebrow">Add-ons (optional)</p>
              <div className="mt-4 space-y-4">
                {ADD_ONS.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {a.name}
                        {a.oneTime && (
                          <span className="ml-2 font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase">
                            one-time
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {formatMoney(currency, a.price[period][currency])}
                        {a.oneTime ? "" : ` · per ${periodLabel}`}
                        {a.extraSeats ? " · per seat" : ""}
                      </p>
                    </div>
                    {a.id === "team_add" ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setAddonQty((q) => ({ ...q, team_add: Math.max(0, q.team_add - 1) }))
                          }
                          className="h-9 w-9 rounded-lg border border-border text-sm"
                          aria-label="Remove a seat"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm">{addonQty.team_add}</span>
                        <button
                          onClick={() =>
                            setAddonQty((q) => ({ ...q, team_add: Math.min(50, q.team_add + 1) }))
                          }
                          className="h-9 w-9 rounded-lg border border-border text-sm"
                          aria-label="Add a seat"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setAddonQty((q) => ({ ...q, [a.id]: q[a.id] > 0 ? 0 : 1 }))
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                          addonQty[a.id] > 0
                            ? "bg-primary text-primary-foreground"
                            : "border border-border text-foreground"
                        }`}
                      >
                        {addonQty[a.id] > 0 ? "Added" : "Add"}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-7 border-t border-border/70 pt-5">
                <p className="eyebrow">Applications unlocked</p>
                <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {suiteApps.map((app) => (
                    <li key={app.url}>
                      <span className="text-foreground">{app.name}</span> — {app.blurb}
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            <aside className="panel-featured flex flex-col p-7">
              <p className="eyebrow">Your total</p>
              <h2 className="mt-2 text-xl font-semibold">
                {quote.planName} — {periodLabel}
              </h2>

              <ul className="mt-5 space-y-2 text-sm">
                {quote.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">
                      {line.label}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </span>
                    <span>{formatMoney(quote.currency, line.amount)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-baseline justify-between border-t border-border/70 pt-4">
                <span className="text-sm font-medium">Total due today</span>
                <span className="font-display text-2xl font-semibold">
                  {formatMoney(quote.currency, quote.total)}
                </span>
              </div>

              <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                One-time payment for {periodLabel} of access. No automatic renewal — PayPal will not
                charge you again.
              </p>

              {session ? (
                <div className="mt-6">
                  <PaypalPayButton selection={selection} />
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Create an account to pay <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </aside>
          </div>

          <div className="panel mt-10 flex flex-col items-start justify-between gap-4 p-7 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Want the full feature list?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                See every module included in OneSuite.
              </p>
            </div>
            <Link
              to="/compare"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              View features <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
