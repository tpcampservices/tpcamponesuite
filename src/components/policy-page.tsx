import { SiteHeader, SiteFooter } from "@/components/site-header";

export type PolicyBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export type PolicySection = {
  number: number;
  heading: string;
  blocks: PolicyBlock[];
};

export function PolicyPage({
  title,
  intro,
  effectiveDate,
  lastUpdated,
  sections,
}: {
  title: string;
  intro?: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: PolicySection[];
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <article className="mx-auto max-w-3xl px-5 pt-16 pb-20">
          <p className="eyebrow">TP-CAMP One Suite</p>
          <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-4xl">{title}</h1>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs tracking-wide text-muted-foreground">
            <div className="flex gap-2">
              <dt>Effective Date:</dt>
              <dd className="text-foreground">{effectiveDate}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Last Updated:</dt>
              <dd className="text-foreground">{lastUpdated}</dd>
            </div>
          </dl>

          {intro ? (
            <p className="mt-7 text-base leading-relaxed text-muted-foreground">{intro}</p>
          ) : null}

          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.number} id={`section-${section.number}`}>
                <h2 className="text-lg font-semibold">
                  {section.number}. {section.heading}
                </h2>
                <div className="mt-3 space-y-4">
                  {section.blocks.map((block, i) =>
                    block.type === "p" ? (
                      <p key={i} className="text-[0.95rem] leading-relaxed text-muted-foreground">
                        {block.text}
                      </p>
                    ) : (
                      <ul key={i} className="space-y-2 pl-1">
                        {block.items.map((item) => (
                          <li
                            key={item}
                            className="flex gap-3 text-[0.95rem] leading-relaxed text-muted-foreground"
                          >
                            <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
