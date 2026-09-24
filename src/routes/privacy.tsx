import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("privacy");

export const Route = createFileRoute("/privacy")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
