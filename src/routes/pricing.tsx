import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { tiers } from "@/lib/tiers";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "TP-CAMP Pricing — Free Tier 1, One-Time Fees" },
      {
        name: "description",
        content:
          "TP-CAMP plans: Tier 1 free, then one-time fees from USD $300 — catalogue, split sheets and invoicing, campaign operations, and full label finance management. Apps unlock as your tier goes up.",
      },
      { property: "og:title", content: "TP-CAMP Pricing — Free Tier 1, One-Time Fees" },
      {
        property: "og:description",
        content:
          "Three tiers of music business software: catalogue and invoicing, campaign operations, and full finance management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-10">
          <p className="eyebrow">One-time payment · no subscription</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl">
            One suite. Three tiers. Every app unlocks as you grow.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Create an account and start free on Tier 1. Upgrade with a single one-time payment —
            no monthly or yearly billing. Your apps unlock automatically once payment is confirmed.
          </p>

        </section>

        <section id="tiers" className="mx-auto max-w-6xl px-5 pb-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {tiers.map((tier) => (
              <article
                key={tier.id}
                id={tier.id}
                className={`${tier.featured ? "panel-featured" : "panel"} flex flex-col p-7`}
              >
                {tier.featured && (
                  <span className="mb-4 w-fit rounded-full bg-primary px-3 py-1 font-mono text-[0.65rem] tracking-[0.2em] text-primary-foreground uppercase">
                    Most popular
                  </span>
                )}
                <h2 className="text-xl font-semibold">{tier.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold">
                    {tier.usd === 0 ? "Free" : `$${tier.usd.toLocaleString()}`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tier.usd === 0 ? "no payment required" : "USD one-time"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                  {tier.ttd === 0 ? "TTD $0" : `TTD $${tier.ttd.toLocaleString()} one-time`}
                </p>


                <p className="mt-5 text-sm text-muted-foreground">{tier.summary}</p>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.highlights.map((h) => (
                    <li key={h} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 border-t border-border/70 pt-5">
                  <p className="eyebrow">Included apps</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {tier.apps.map((app) => (
                      <li key={app.url}>
                        <span className="text-foreground">{app.name}</span> — {app.blurb}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">
                    App links unlock in your dashboard once this tier is paid for.
                  </p>
                </div>

                <Link
                  to="/dashboard"
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 ${
                    tier.featured
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-secondary text-secondary-foreground"
                  }`}
                >
                  {tier.usd === 0 ? "Start free" : "Get started"} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>

          <div className="panel mt-10 flex flex-col items-start justify-between gap-4 p-7 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Not sure which tier fits?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                See every feature side by side in the tier comparison chart.
              </p>
            </div>
            <Link
              to="/compare"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Compare tiers <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
