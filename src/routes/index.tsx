import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, ShieldCheck, Globe2, Sparkles } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { plan, suiteApps, BETA_LABEL } from "@/lib/tiers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite — Run Your Music Business, Not Just Your Music" },
      {
        name: "description",
        content:
          "Catalogue. Rights. Splits. Contracts. Money. Campaigns. One workspace for independent artists and labels — $500 USD / $3,500 TTD per year, or pay monthly.",
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

function HomePage() {
  const [yearly, setYearly] = useState(true);
  const price = yearly ? plan.yearly : plan.monthly;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-14">
          <p className="eyebrow">{BETA_LABEL} · Independent rights administration</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-6xl">
            TP-CAMP OneSuite
          </h1>
          <p className="mt-4 max-w-3xl text-2xl font-medium sm:text-3xl">
            Run your music business—not just your music.
          </p>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Catalogue. Rights. Splits. Contracts. Money. Campaigns. One workspace built for
            independent artists and labels.
          </p>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground">
            Stop running your music career through WhatsApp messages, spreadsheets, random PDFs and
            scattered files. TP-CAMP gives artists, managers and labels one environment to organise
            their rights, catalogue, finances, contracts, releases and campaigns.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/services"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Explore services
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="grid gap-6 md:grid-cols-3">
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

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <p className="eyebrow">One plan · every tool</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Everything in the suite, one fee
          </h2>

          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
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

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <article className="panel-featured flex flex-col p-7 lg:col-span-1">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-5 font-display text-4xl font-semibold">
                ${price.usd.toLocaleString()}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  USD / {yearly ? "year" : "month"}
                </span>
              </p>
              <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                TTD ${price.ttd.toLocaleString()} / {yearly ? "year" : "month"}
              </p>
              <Link
                to="/pricing"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </article>

            <article className="panel flex flex-col p-7 lg:col-span-2">
              <p className="eyebrow">Included</p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {plan.highlights.slice(0, 8).map((h) => (
                  <li key={h} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-muted-foreground">
                {suiteApps.map((a) => a.name).join(" · ")}
              </p>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
