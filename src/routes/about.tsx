import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About TP-CAMP — Independent Rights Administration in Trinidad & Tobago" },
      {
        name: "description",
        content:
          "TP-CAMP is an independent rights administration and label services platform based in Trinidad and Tobago, designed for artists in the Caribbean and the world by extension.",
      },
      { property: "og:title", content: "About TP-CAMP" },
      {
        property: "og:description",
        content:
          "Professional infrastructure for independent artists, songwriters, producers, publishers and labels — without signing away your catalogue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const sections = [
  {
    title: "Our mission",
    body: "To give emerging artists, songwriters, producers, publishers and small-to-medium labels access to the same professional infrastructure historically reserved for major-label acts — without asking them to sign away their catalogue.",
  },
  {
    title: "Who we serve",
    body: "Performing artists, songwriters, composers, producers, publishers, record labels, artist managers, rights holders and estate representatives across the independent music ecosystem.",
  },
  {
    title: "Label services vs. a record deal",
    body: "A traditional label deal typically requires assigning rights in exchange for services and advances. With TP-CAMP you pay for the services you need — rights administration, distribution, marketing — while keeping ownership of your masters and compositions.",
  },
  {
    title: "Our approach",
    body: "We combine catalogue and rights administration, distribution to DSPs, publishing support, release strategy, marketing, video monetisation and account management under one platform, with a creative team available for audio, video and artwork production.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pt-16 pb-16">
        <p className="eyebrow">About TP-CAMP</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
          An independent rights administration and label services platform
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          For music professionals who want to stay in control of their work. TP-CAMP is based in
          Trinidad and Tobago and was designed for artists in the Caribbean — and the world by
          extension.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="panel p-7">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="panel mt-10 flex flex-col items-start justify-between gap-4 p-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Everything you need — without a record deal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay for the services you need. Retain your rights and your catalogue.
            </p>
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            View pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
