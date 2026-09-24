import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { legalDocs } from "@/lib/legal-content";

const description = "All official TP-CAMP OneSuite legal and policy documents, covering every OneSuite application.";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "TP-CAMP OneSuite | Legal & Policies" },
      { name: "description", content: description },
      { property: "og:title", content: "TP-CAMP OneSuite | Legal & Policies" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LegalIndex,
});

function LegalIndex() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-16 pb-16">
        <p className="eyebrow">TP-CAMP OneSuite</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Legal &amp; Policies</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          These policies apply across the whole OneSuite ecosystem, including Catalog, Splits, Operations, Invoice and Finance.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {legalDocs.map((d) => (
            <li key={d.slug}>
              <a href={`/${d.slug}`} className="panel block h-full p-6 transition-colors hover:border-accent">
                <h2 className="text-lg font-semibold">{d.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{d.description}</p>
                <p className="mt-4 font-mono text-xs text-muted-foreground">Last updated {d.lastUpdated}</p>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
