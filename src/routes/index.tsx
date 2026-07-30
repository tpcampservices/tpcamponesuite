import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck, Globe2, Sparkles } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { tiers } from "@/lib/tiers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TP-CAMP — Rights Administration & Label Services for Independents" },
      {
        name: "description",
        content:
          "Everything you need without a record deal. Catalogue, split sheets, invoicing, campaign operations and label finance — built in Trinidad and Tobago for the Caribbean and the world.",
      },
      { property: "og:title", content: "TP-CAMP — Everything you need without a record deal" },
      {
        property: "og:description",
        content:
          "Independent rights administration and label services. Pay for the services you need and keep your masters and compositions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-14">
          <p className="eyebrow">Independent rights administration</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold sm:text-6xl">
            Everything you need — without a record deal
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Pay for the services you need. Retain your rights and your catalogue. TP-CAMP gives
            artists, songwriters, producers, publishers and labels a connected back office —
            catalogue and splits, invoicing and payables, release operations and full double-entry
            finance.
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
                body: "Catalogue, split sheets, invoicing, campaigns and accounting — all unlocked as your tier grows.",
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
          <p className="eyebrow">Three yearly tiers</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Apps unlock as your tier goes up
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {tiers.map((tier) => (
              <article key={tier.id} className="panel flex flex-col p-7">
                <h3 className="text-lg font-semibold">{tier.name.split(" — ")[0]}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
                <p className="mt-5 font-display text-3xl font-semibold">
                  ${tier.usd.toLocaleString()}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">USD / year</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {tier.highlights.slice(0, 3).map((h) => (
                    <li key={h} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/pricing"
                  hash={tier.id}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent"
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
