import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PaypalSubscribe } from "@/components/paypal-subscribe";
import { useSession } from "@/hooks/use-session";
import { plan, suiteApps, BETA_LABEL } from "@/lib/tiers";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite Pricing — $500 USD / $3,500 TTD a Year" },
      {
        name: "description",
        content:
          "One fee for the whole TP-CAMP suite: $500 USD or $3,500 TTD yearly, or $49 USD / $350 TTD monthly. Catalogue, splits, contracts, invoicing, campaigns and label finance.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Pricing" },
      {
        property: "og:description",
        content:
          "One subscription, every tool in the suite. Switch between monthly and yearly billing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [yearly, setYearly] = useState(true);
  const price = yearly ? plan.yearly : plan.monthly;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-10">
          <p className="eyebrow">{BETA_LABEL} · One fee · all tools</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl">
            One suite. One subscription. Every tool included.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            No tiers and no upsells — every client gets access to all the tools available in the
            TP-CAMP suite. Choose monthly or yearly billing.
          </p>

          <div className="mt-7 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
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
        </section>

        <section id="plan" className="mx-auto max-w-6xl px-5 pb-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <article className="panel-featured flex flex-col p-7">
              <span className="mb-4 w-fit rounded-full bg-primary px-3 py-1 font-mono text-[0.65rem] tracking-[0.2em] text-primary-foreground uppercase">
                {BETA_LABEL}
              </span>
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold">
                  ${price.usd.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">
                  USD / {yearly ? "year" : "month"}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                TTD ${price.ttd.toLocaleString()} / {yearly ? "year" : "month"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {yearly
                  ? `Billed yearly. Works out to about $${Math.round(plan.yearly.usd / 12)} USD / $${Math.round(plan.yearly.ttd / 12)} TTD a month.`
                  : `Billed monthly. Pay yearly for $${plan.yearly.usd.toLocaleString()} USD / $${plan.yearly.ttd.toLocaleString()} TTD.`}
              </p>

              <p className="mt-5 text-sm text-muted-foreground">{plan.summary}</p>

              {session ? (
                <div className="mt-7">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Activate your plan — pay securely with PayPal.
                  </p>
                  <PaypalSubscribe cycle={yearly ? "yearly" : "monthly"} />
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Create an account to activate <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </article>


            <article className="panel flex flex-col p-7 lg:col-span-2">
              <p className="eyebrow">What's included</p>
              <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 border-t border-border/70 pt-5">
                <p className="eyebrow">Applications unlocked</p>
                <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  {suiteApps.map((app) => (
                    <li key={app.url}>
                      <span className="text-foreground">{app.name}</span> — {app.blurb}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  App links unlock in your dashboard once your subscription is active.
                </p>
              </div>
            </article>
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
