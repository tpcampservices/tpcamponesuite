import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { compareGroups, suiteApps, plan, BETA_LABEL, type CompareRow } from "@/lib/tiers";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite Features — Everything Included" },
      {
        name: "description",
        content:
          "Full TP-CAMP OneSuite feature list: catalogue, split sheets, contracts, invoicing, payables, campaign operations and label finance — all included in one fee.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite Features" },
      {
        property: "og:description",
        content: "Every module included in the TP-CAMP OneSuite subscription.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

function Cell({ value }: { value: CompareRow["included"] }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-accent" />;
  if (value === false) return <span className="text-muted-foreground/50">—</span>;
  return <span className="font-mono text-xs">{value}</span>;
}

function ComparePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">{BETA_LABEL} · Feature list</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Everything in OneSuite</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          There are no tiers. One subscription unlocks every module and every application below.
        </p>

        <div className="panel mt-10 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[62%] p-5 text-left font-medium text-muted-foreground">Feature</th>
                <th className="p-5 text-center align-top">
                  <span className="block font-display text-base font-semibold">{plan.name}</span>
                  <span className="mt-2 block font-mono text-xs text-accent">
                    ${plan.yearly.usd} USD · ${plan.yearly.ttd.toLocaleString()} TTD / year
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {compareGroups.map((group) => (
                <Fragment key={group.group}>
                  <tr className="bg-surface/60">
                    <td
                      colSpan={2}
                      className="border-y border-border px-5 py-2.5 font-mono text-[0.7rem] tracking-[0.2em] text-accent uppercase"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={group.group + row.feature} className="border-b border-border/50">
                      <td className="px-5 py-3.5">{row.feature}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.included} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
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
              ${plan.monthly.usd} USD / ${plan.monthly.ttd} TTD a month, or ${plan.yearly.usd} USD /
              ${plan.yearly.ttd.toLocaleString()} TTD a year.
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
