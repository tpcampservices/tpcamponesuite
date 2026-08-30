import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy-page";
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_LAST_UPDATED,
  termsSections,
} from "@/lib/policy-content";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "TP-CAMP One Suite | Terms of Service" },
      {
        name: "description",
        content:
          "The Terms of Service governing TP-CAMP One Suite and its connected applications, modules and services.",
      },
      { property: "og:title", content: "TP-CAMP One Suite | Terms of Service" },
      {
        property: "og:description",
        content:
          "Terms governing accounts, plans, payments, user content, music rights information and acceptable use of TP-CAMP One Suite.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tpcamponesuite.app/terms" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tpcamponesuite.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      lastUpdated={POLICY_LAST_UPDATED}
      sections={termsSections}
    />
  );
}
