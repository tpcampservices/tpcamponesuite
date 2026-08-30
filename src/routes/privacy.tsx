import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy-page";
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_LAST_UPDATED,
  privacySections,
} from "@/lib/policy-content";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "TP-CAMP One Suite | Privacy Policy" },
      {
        name: "description",
        content:
          "How TP-CAMP collects, uses, stores, shares and protects personal information across TP-CAMP One Suite and its connected applications.",
      },
      { property: "og:title", content: "TP-CAMP One Suite | Privacy Policy" },
      {
        property: "og:description",
        content:
          "Privacy practices covering account data, catalogue and rights information, business records, payments, retention and your privacy rights.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tpcamponesuite.app/privacy" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tpcamponesuite.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      lastUpdated={POLICY_LAST_UPDATED}
      sections={privacySections}
    />
  );
}
