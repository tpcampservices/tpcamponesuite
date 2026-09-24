import { Link } from "@tanstack/react-router";
import { CONTRACT_BUILDER_DENIED } from "@/lib/contracts.core";

/** Shows the plain plan message when the server refused a Contract Builder action. */
export function ContractPlanNotice({ errors }: { errors: unknown[] }) {
  const denied = errors.some((e) => e instanceof Error && e.message.includes(CONTRACT_BUILDER_DENIED));
  if (!denied) return null;
  return (
    <div role="alert" className="panel mb-8 flex flex-wrap items-center justify-between gap-4 p-5">
      <p className="text-sm font-medium">{CONTRACT_BUILDER_DENIED}</p>
      <Link to="/pricing" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent/60">
        See plans
      </Link>
    </div>
  );
}
