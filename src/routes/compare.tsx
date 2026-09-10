import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { suiteApps, BETA_LABEL } from "@/lib/tiers";
import { PLANS, LIMIT_LABELS, type PlanLimits } from "@/lib/plans";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite Plan Comparison — Starter, Growth, Pro, Institutional" },
      {
        name: "description",
        content:
          "Compare TP-CAMP OneSuite fixed-term plans. All apps included; limits scale with Starter, Growth, Pro and Institutional.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Plan Comparison" },
      {
        property: "og:description",
        content: "Compare fixed-term plans and feature limits for the TP-CAMP OneSuite music business platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

const featureGroups: { group: string; rows: { label: string; key?: keyof PlanLimits; included?: boolean }[] }[] = [
  {
    group: "Applications included",
    rows: [
      { label: "TP-CAMP Catalog — works, recordings, releases", included: true },
      { label: "TP-CAMP Split Sheets — composition & master splits", included: true },
      { label: "TP-CAMP Invoice — invoices, receipts & payables", included: true },
      { label: "TP-CAMP Operations Hub — release campaigns & tasks", included: true },
      { label: "TP-CAMP Finance — accounting, budgets & royalties", included: true },
    ],
  },
  {
    group: "Usage limits",
    rows: [
      { label: LIMIT_LABELS.seats, key: "seats" },
      { label: LIMIT_LABELS.catalogRecords, key: "catalogRecords" },
      { label: LIMIT_LABELS.activeProjects, key: "activeProjects" },
      { label: LIMIT_LABELS.invoicesPerMonth, key: "invoicesPerMonth" },
      { label: LIMIT_LABELS.financeTransactionsPerMonth, key: "financeTransactionsPerMonth" },
      { label: LIMIT_LABELS.contractsPerMonth, key: "contractsPerMonth" },
      { label: LIMIT_LABELS.splitSheetsPerMonth, key: "splitSheetsPerMonth" },
    ],
  },
  {
    group: "Platform capabilities",
    rows: [
      { label: "Works, recordings & releases with CSV bulk import", included: true },
      { label: "Writer / publisher & performer / producer splits", included: true },
      { label: "Split Sheet Studio with version history & PDF export", included: true },
      { label: "Trinidad and Tobago contract templates & .docx export", included: true },
      { label: "Invoices, quotations, receipts & branded PDFs", included: true },
      { label: "Supplier bills, payment vouchers & payables dashboard", included: true },
      { label: "Release projects, workflow templates & approvals", included: true },
      { label: "Double-entry accounting, ledger & royalty imports", included: true },
      { label: "Fixed-term access with manual renewal", included: true },
    ],
  },
];

function ComparePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pt-16 pb-16">
        <p className="eyebrow">{BETA_LABEL} · Plan comparison</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Compare OneSuite plans</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Every plan unlocks all five TP-CAMP applications. Choose the plan that fits your team size,
          catalogue depth and monthly workflow volume.
        </p>

        <div className="panel mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[34%] p-5 text-left font-medium text-muted-foreground">Feature / limit</th>
                {PLANS.map((p) => (
                  <th key={p.id} className="p-5 text-center align-top">
                    <span className="block font-display text-base font-semibold">{p.name}</span>
                    <span className="mt-2 block font-mono text-xs text-accent">
                      USD ${p.price.yearly.USD.toLocaleString()} / yr
                    </span>
                    <span className="block font-mono text-[0.65rem] text-muted-foreground">
                      or ${p.price.monthly.USD.toLocaleString()} / mo
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureGroups.map((group) => (
                <tbody key={group.group}>
                  <tr className="bg-surface/60">
                    <td
                      colSpan={PLANS.length + 1}
                      className="border-y border-border px-5 py-2.5 font-mono text-[0.7rem] tracking-[0.2em] text-accent uppercase"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-b border-border/50">
                      <td className="px-5 py-3.5">{row.label}</td>
                      {PLANS.map((p) => (
                        <td key={p.id} className="px-5 py-3.5 text-center">
                          {row.key ? (
                            <span className="font-mono text-sm">
                              {p.limits[row.key].toLocaleString()}
                            </span>
                          ) : (
                            <Check className="mx-auto h-4 w-4 text-accent" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Launch an app</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suiteApps.map((app) => (
              <a
                key={app.url}
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

        <div className="panel mt-12 flex flex-col items-start justify-between gap-4 p-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Ready to run your business in one place?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plans start at USD $50 for one month. No automatic renewals.
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
