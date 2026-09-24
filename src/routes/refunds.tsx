import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("refunds");

export const Route = createFileRoute("/refunds")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
