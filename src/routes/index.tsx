import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Globe2,
  Sparkles,
  Disc3,
  FileText,
  Split,
  Wallet,
  BarChart3,
  Zap,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PLANS, formatMoney, type BillingPeriod } from "@/lib/plans";
import { suiteApps, BETA_LABEL } from "@/lib/tiers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite — Run Your Music Business, Not Just Your Music" },
      {
        name: "description",
        content:
          "Catalogue. Rights. Splits. Contracts. Money. Campaigns. One workspace for independent artists and labels — fixed-term plans from USD 50.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite — One workspace for your music business" },
      {
        property: "og:description",
        content:
          "Stop running your music career through WhatsApp messages, spreadsheets and scattered files. One environment for rights, catalogue, finances, contracts, releases and campaigns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const appIcons: Record<string, React.ElementType> = {
  catalog: Disc3,
  invoice: FileText,
  splits: Split,
  operations: Zap,
  finance: Wallet,
};

function HomePage() {
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const featured = PLANS.find((p) => p.highlight) ?? PLANS[1];
  const price = formatMoney("USD", featured.price[period]["USD"]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        {/* Hero — command centre */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-dot opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_40%,transparent_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />

          <div className="relative mx-auto max-w-7xl px-5 pt-16 pb-20 lg:pt-24 lg:pb-28">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7 space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-card/60 px-3 py-1.5 backdrop-blur-sm">
                  <span className="status-pulse relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  <span className="eyebrow text-[0.6rem]">
                    {BETA_LABEL} · Caribbean Hub Active
                  </span>
                </div>

                <h1 className="max-w-3xl text-5xl leading-[0.92] font-semibold tracking-tighter sm:text-7xl">
                  TP-CAMP <span className="text-accent">OneSuite</span>
                </h1>

                <p className="max-w-xl text-xl font-medium sm:text-2xl">
                  Run your music business—not just your music.
                </p>

                <p className="max-w-2xl text-lg text-muted-foreground">
                  Catalogue. Rights. Splits. Contracts. Money. Campaigns. One workspace built for
                  independent artists and labels in Trinidad and Tobago, the Caribbean, and the world
                  by extension.
                </p>

                <p className="max-w-2xl text-base text-muted-foreground">
                  Stop running your music career through WhatsApp messages, spreadsheets, random PDFs
                  and scattered files. TP-CAMP gives artists, managers and labels one environment to
                  organise their rights, catalogue, finances, contracts, releases and campaigns.
                </p>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_oklch(0.86_0.13_165/0.25)] transition-opacity hover:opacity-90"
                  >
                    Get started <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/services"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    Explore services
                  </Link>
                </div>
              </div>

              {/* Command module */}
              <div className="lg:col-span-5">
                <div className="panel relative overflow-hidden backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-accent/40" />
                      <div className="h-2 w-2 rounded-full bg-accent/40" />
                      <div className="h-2 w-2 rounded-full bg-accent/40" />
                    </div>
                    <span className="eyebrow text-[0.55rem]">OneSuite Control v1.0</span>
                  </div>

                  <div className="space-y-6 p-6">
                    <div className="space-y-3">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="eyebrow text-[0.55rem]">Connected modules</p>
                          <p className="mt-1 font-display text-2xl font-semibold">5 apps · 1 account</p>
                        </div>
                      </div>
                      <div className="flex h-24 items-end gap-1 px-1">
                        {[40, 60, 45, 75, 90, 100].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t bg-accent/20 first:rounded-bl last:rounded-br"
                            style={{ height: `${h}%`, opacity: 0.3 + i * 0.12 }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border bg-background/50 p-3">
                        <p className="eyebrow text-[0.55rem]">Fixed-term access</p>
                        <p className="mt-1 font-display text-lg font-semibold">No auto-renewal</p>
                      </div>
                      <div className="rounded-xl border border-border bg-background/50 p-3">
                        <p className="eyebrow text-[0.55rem]">Currency</p>
                        <p className="mt-1 font-display text-lg font-semibold">USD (PayPal)</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-accent/10 bg-background/80 p-3 font-mono text-xs text-accent/80">
                      <span className="animate-pulse">&gt;</span> Awaiting deployment…
                    </div>
                  </div>

                  <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
                </div>

                <div className="absolute -top-4 -left-4 hidden rounded-lg bg-accent p-4 text-primary-foreground md:block">
                  <p className="text-[0.6rem] font-black uppercase leading-none tracking-tighter">
                    Caribbean
                    <br />
                    Engine
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Promise cards */}
        <section className="mx-auto max-w-7xl px-5 pb-16">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Keep your ownership",
                body: "Label services instead of a record deal — you never assign your masters or compositions to access professional infrastructure.",
              },
              {
                icon: Globe2,
                title: "Caribbean built, globally useful",
                body: "Designed in Trinidad and Tobago for artists across the Caribbean and, by extension, the world.",
              },
              {
                icon: Sparkles,
                title: "One connected platform",
                body: "Catalogue, split sheets, contracts, invoicing, campaigns and accounting — all included in one fee.",
              },
            ].map((item) => (
              <article key={item.title} className="panel p-7">
                <item.icon className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* App launcher preview */}
        <section className="mx-auto max-w-7xl px-5 pb-20">
          <p className="eyebrow">Suite modules</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Five applications. One account. One payment.
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Every TP-CAMP app launches from your OneSuite dashboard. Choose the plan that fits your
            catalogue size and team, then unlock the modules you need.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suiteApps.map((app) => {
              const Icon = appIcons[app.slug] ?? BarChart3;
              return (
                <a
                  key={app.slug}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="panel group flex flex-col gap-2 p-6 transition-colors hover:border-accent/60"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-accent" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{app.name}</h3>
                  <p className="text-sm text-muted-foreground">{app.blurb}</p>
                </a>
              );
            })}
          </div>
        </section>

        {/* Pricing preview */}
        <section className="mx-auto max-w-7xl px-5 pb-20">
          <p className="eyebrow">Fixed-term access</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Choose your access period. Pay once. Renew manually.
          </h2>

          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <button
              onClick={() => setPeriod("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                period === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              1 month
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                period === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              12 months
            </button>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-4">
            {PLANS.map((p) => (
              <article
                key={p.id}
                className={`${p.highlight ? "panel-featured" : "panel"} flex flex-col p-6`}
              >
                {p.highlight && (
                  <span className="mb-3 w-fit rounded-full bg-primary px-3 py-1 font-mono text-[0.6rem] tracking-[0.2em] text-primary-foreground uppercase">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <p className="mt-5 font-display text-3xl font-semibold">
                  {formatMoney("USD", p.price[period]["USD"])}
                </p>
                <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                  USD · {period === "yearly" ? "12 months" : "1 month"}
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  <li className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>
                      <span className="text-foreground">{p.limits.seats}</span> user
                      {p.limits.seats === 1 ? "" : "s"}
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>
                      <span className="text-foreground">{p.limits.catalogRecords.toLocaleString()}</span>{" "}
                      catalogue records
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>
                      <span className="text-foreground">{p.limits.activeProjects.toLocaleString()}</span>{" "}
                      active projects
                    </span>
                  </li>
                </ul>
                <Link
                  to="/pricing"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent"
                >
                  Choose {p.name} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>

          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            All plans unlock every TP-CAMP application. Limits scale with your plan. Add extra seats,
            professional support or guided onboarding at checkout.
          </p>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-20">
          <div className="panel-featured flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Everything you need — without a record deal.</h2>
              <p className="mt-2 text-muted-foreground">
                Pay for the services you need. Retain your rights and your catalogue.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
