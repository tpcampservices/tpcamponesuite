import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { legalDocs, type LegalDoc } from "@/lib/legal-content";

export function legalHead(doc: LegalDoc) {
  const title = `TP-CAMP OneSuite | ${doc.title}`;
  return {
    meta: [
      { title },
      { name: "description", content: doc.description },
      { property: "og:title", content: title },
      { property: "og:description", content: doc.description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-12 pb-16 lg:grid-cols-[1fr_240px]">
        <article className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">OneSuite home</Link>
            <Link to="/legal" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Legal &amp; Policies
            </Link>
          </nav>
          <p className="eyebrow mt-8">TP-CAMP OneSuite</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{doc.title}</h1>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs text-muted-foreground">
            <div><dt className="inline">Effective Date: </dt><dd className="inline text-foreground">{doc.effectiveDate}</dd></div>
            <div><dt className="inline">Last Updated: </dt><dd className="inline text-foreground">{doc.lastUpdated}</dd></div>
          </dl>
          <div className="legal-prose mt-10 max-w-[72ch]" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </article>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="All policies" className="panel p-5">
            <p className="eyebrow">Policies</p>
            <ul className="mt-3 space-y-1 text-sm">
              {legalDocs.map((d) => (
                <li key={d.slug}>
                  <a
                    href={`/${d.slug}`}
                    aria-current={d.slug === doc.slug ? "page" : undefined}
                    className={d.slug === doc.slug ? "block py-1 text-accent" : "block py-1 text-muted-foreground hover:text-foreground"}
                  >
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
