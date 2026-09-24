import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("copyright");

export const Route = createFileRoute("/copyright")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
