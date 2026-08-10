import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { suiteApps } from "@/lib/tiers";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "TP-CAMP Services — Rights, Distribution, Campaigns & Label Finance" },
      {
        name: "description",
        content:
          "Catalogue and rights administration, split sheets, invoicing and payables, publishing support, release strategy, marketing and label finance.",
      },
      { property: "og:title", content: "TP-CAMP Services" },
      {
        property: "og:description",
        content:
          "Rights administration, distribution, campaign operations and label finance under one platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

const services = [
  {
    title: "Catalogue & rights administration",
    body: "Works, recordings and releases with writer, composer, publisher, performer and producer splits, lyrics upload, linked recordings, CSV import and spreadsheet export.",
  },
  {
    title: "Split sheet studio",
    body: "Composition and master split sheets, a reusable contributor roster, version history and restore, plus PDF and bulk ZIP export.",
  },
  {
    title: "Invoicing & payables",
    body: "Invoices, quotations and receipts with a conversion workflow, customer directory, branded PDF export, supplier bills, payment vouchers and a payables dashboard.",
  },
  {
    title: "Publishing support",
    body: "Publishing support so your registrations, metadata and royalties stay accurate and traceable.",
  },
  {
    title: "Release strategy & marketing",
    body: "Campaign command centre with projects, workflow templates, approvals, a unified calendar, readiness scoring and an activity audit trail.",
  },
  {
    title: "Label finance & royalties",
    body: "Double-entry accounting, general ledger, statements, release P&L with ROI and recoupment, budgets, forecasts and royalty CSV/XLSX imports.",
  },
];

function ServicesPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Services</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
          Label services, on your terms
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Choose the services you need. Everything runs on one platform, and each subscription tier
          unlocks its own set of TP-CAMP applications.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.title} className="panel p-7">
              <Check className="h-5 w-5 text-accent" />
              <h2 className="mt-4 text-lg font-semibold">{service.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{service.body}</p>
            </article>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Applications by tier</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article key={tier.id} className="panel p-7">
              <p className="eyebrow">Tier {tier.level}</p>
              <h3 className="mt-2 text-lg font-semibold">{tier.name.split(" — ")[1]}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {tier.apps.map((app) => (
                  <li key={app.url}>
                    <span className="text-foreground">{app.name}</span> — {app.blurb}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="panel mt-10 flex flex-col items-start justify-between gap-4 p-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Ready to start?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an account, choose a tier and your apps unlock once payment clears.
            </p>
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
