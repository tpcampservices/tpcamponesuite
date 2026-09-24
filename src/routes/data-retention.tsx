import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, legalHead } from "@/components/legal-page";
import { getLegalDoc } from "@/lib/legal-content";

const doc = getLegalDoc("data-retention");

export const Route = createFileRoute("/data-retention")({
  head: () => legalHead(doc),
  component: () => <LegalPage doc={doc} />,
});
