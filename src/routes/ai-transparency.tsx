import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("ai-transparency");

export const Route = createFileRoute("/ai-transparency")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
