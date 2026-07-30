import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Minus } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { compareGroups, tiers, type CompareRow } from "@/lib/tiers";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare TP-CAMP Tiers — Feature Chart by Plan" },
      {
        name: "description",
        content:
          "Side-by-side TP-CAMP tier comparison: catalogue, split sheets, invoicing, payables, campaign operations and label finance features by plan.",
      },
      { property: "og:title", content: "Compare TP-CAMP Tiers — Feature Chart" },
      {
        property: "og:description",
        content:
          "Every TP-CAMP feature compared across Tier 1, Tier 2 and Tier 3 yearly subscriptions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

function Cell({ value }: { value: CompareRow["t1"] }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-accent" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />;
  return <span className="font-mono text-xs">{value}</span>;
}

function ComparePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Tier comparison</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Compare every tier</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Each tier includes everything from the tier below it, plus its own applications.
        </p>

        <div className="panel mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[38%] p-5 text-left font-medium text-muted-foreground">
                  Feature
                </th>
                {tiers.map((tier) => (
                  <th key={tier.id} className="p-5 text-center align-top">
                    <span className="block font-display text-base font-semibold">
                      {tier.name.split(" — ")[0]}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {tier.name.split(" — ")[1]}
                    </span>
                    <span className="mt-2 block font-mono text-xs text-accent">
                      ${tier.usd} USD · ${tier.ttd.toLocaleString()} TTD
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareGroups.map((group) => (
                <>
                  <tr key={group.group} className="bg-surface/60">
                    <td
                      colSpan={4}
                      className="border-y border-border px-5 py-2.5 font-mono text-[0.7rem] tracking-[0.2em] text-accent uppercase"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={group.group + row.feature} className="border-b border-border/50">
                      <td className="px-5 py-3.5">{row.feature}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.t1} />
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.t2} />
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <Cell value={row.t3} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Launch an app</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.flatMap((tier) =>
              tier.apps.map((app) => (
                <a
                  key={app.url}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="panel group flex flex-col gap-1 p-5 transition-colors hover:border-accent/60"
                >
                  <span className="eyebrow">{tier.name.split(" — ")[0]}</span>
                  <span className="mt-2 flex items-center justify-between gap-3 text-base font-semibold">
                    {app.name}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
                  </span>
                  <span className="text-sm text-muted-foreground">{app.blurb}</span>
                </a>
              )),
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
