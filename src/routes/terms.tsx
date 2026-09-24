import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("terms");

export const Route = createFileRoute("/terms")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
