import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("cancellation");

export const Route = createFileRoute("/cancellation")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
