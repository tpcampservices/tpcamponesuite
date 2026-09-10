import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Disc3, Split, FileText, Zap, Wallet, ShieldCheck, Lock } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { suiteApps, BETA_LABEL } from "@/lib/tiers";
import { PLANS } from "@/lib/plans";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite Services — Catalogue, Splits, Contracts, Finance & Operations" },
      {
        name: "description",
        content:
          "Explore the TP-CAMP OneSuite music business platform: catalogue & rights, split sheets, contracts, invoicing, release operations and label finance.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Services" },
      {
        property: "og:description",
        content: "Catalogue, splits, contracts, invoicing, release operations and label finance in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

const services = [
  {
    icon: Disc3,
    title: "Catalogue & rights management",
    features: [
      "Works, recordings and releases",
      "Contributor splits and ownership shares",
      "CSV bulk import and spreadsheet export",
      "ISRC, UPC, release-date and territory tracking",
    ],
  },
  {
    icon: Split,
    title: "Split sheets",
    features: [
      "Composition and master split templates",
      "Writer / publisher and performer / producer shares",
      "Version history and audit trail",
      "PDF and ZIP export for signature",
    ],
  },
  {
    icon: FileText,
    title: "Contracts",
    features: [
      "Trinidad and Tobago legal templates",
      "Guided data entry for parties, works and terms",
      "DOCX generation with token replacement",
      "Business profile and legal-review flagging",
    ],
  },
  {
    icon: Zap,
    title: "Release operations",
    features: [
      "Campaign and project workspaces",
      "Workflow templates and approval stages",
      "Calendar and milestone tracking",
      "Task assignments and audit trail",
    ],
  },
  {
    icon: FileText,
    title: "Invoicing & payables",
    features: [
      "Invoices, quotations and receipts",
      "Branded PDF generation",
      "Supplier bills and payment vouchers",
      "Customer and supplier records",
    ],
  },
  {
    icon: Wallet,
    title: "Label finance",
    features: [
      "Double-entry accounting and ledger",
      "Budgets, forecasts and royalty imports",
      "Chart of accounts and journal entries",
      "Financial reports and analytics",
    ],
  },
];

function ServicesPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pt-16 pb-20">
        <p className="eyebrow">{BETA_LABEL} · Services</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
          One suite. Every part of the business.
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
          TP-CAMP OneSuite gives artists, managers and labels one environment to manage rights,
          catalogue, finances, contracts, releases and campaigns. Each module is available through
          every plan; limits scale with the plan you choose.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <article key={s.title} className="panel flex flex-col p-7">
              <s.icon className="h-6 w-6 text-accent" />
              <h2 className="mt-5 text-lg font-semibold">{s.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {s.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-accent" />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <section className="mt-16">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="panel p-8">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-semibold">Keep your rights and your catalogue</h2>
              </div>
              <p className="mt-3 text-muted-foreground">
                TP-CAMP is built as a label-services infrastructure, not a record deal. You retain
                ownership of your masters, compositions and data. We provide the workspace, the
                templates and the tools to operate professionally.
              </p>
            </div>

            <div className="panel p-8">
              <div className="flex items-center gap-3">
                <Lock className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-semibold">Fixed-term access, no auto-renewal</h2>
              </div>
              <p className="mt-3 text-muted-foreground">
                Pay once for the access period you choose. TP-CAMP tracks your start and expiry dates,
                sends renewal reminders, and lets you renew manually. You are never charged automatically
                when a period ends.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Connected applications</h2>
          <p className="mt-2 text-muted-foreground">
            Each module launches from your OneSuite dashboard. Sign in once, access everything.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suiteApps.map((app) => (
              <a
                key={app.slug}
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="panel group flex flex-col gap-1 p-5 transition-colors hover:border-accent/60"
              >
                <span className="eyebrow">OneSuite</span>
                <span className="mt-2 flex items-center justify-between gap-3 text-base font-semibold">
                  {app.name}
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
                </span>
                <span className="text-sm text-muted-foreground">{app.blurb}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="panel mt-16 flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold">Plans from USD $50</h2>
            <p className="mt-2 text-muted-foreground">
              {PLANS.length} fixed-term plans. All apps included. Pick the limits that match your
              catalogue and team.
            </p>
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            See pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
