import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy-page";
import {
  POLICY_EFFECTIVE_DATE,
  POLICY_LAST_UPDATED,
  refundSections,
} from "@/lib/policy-content";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "TP-CAMP One Suite | Refund and Cancellation Policy" },
      {
        name: "description",
        content:
          "Refund, cancellation and billing terms for TP-CAMP One Suite subscriptions, digital access fees and professional services.",
      },
      { property: "og:title", content: "TP-CAMP One Suite | Refund and Cancellation Policy" },
      {
        property: "og:description",
        content:
          "How cancellations, refund eligibility, request periods, chargebacks and approved refunds are handled for TP-CAMP One Suite.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tpcamponesuite.app/refunds" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://tpcamponesuite.app/refunds" }],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <PolicyPage
      title="Refund and Cancellation Policy"
      effectiveDate={POLICY_EFFECTIVE_DATE}
      lastUpdated={POLICY_LAST_UPDATED}
      sections={refundSections}
    />
  );
}
