import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("acceptable-use");

export const Route = createFileRoute("/acceptable-use")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
