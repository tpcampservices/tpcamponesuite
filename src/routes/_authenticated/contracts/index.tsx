import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, Building2, FileText, Lock, Plus, Trash2 } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getMyAccount } from "@/lib/account.functions";
import { listContracts, deleteContract, getBusinessProfile } from "@/lib/contracts.functions";
import { contractForms, templateSummaries } from "@/lib/contracts";

export const Route = createFileRoute("/_authenticated/contracts/")({
  head: () => ({
    meta: [
      { title: "Contract Builder — TP-CAMP Tier 1" },
      {
        name: "description",
        content:
          "Generate Trinidad and Tobago music industry agreements from vetted templates by filling in a guided form.",
      },
      { property: "og:title", content: "TP-CAMP Contract Builder" },
      {
        property: "og:description",
        content: "Build label services, recording, distribution, publishing and management agreements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccount = useServerFn(getMyAccount);
  const fetchContracts = useServerFn(listContracts);
  const fetchProfile = useServerFn(getBusinessProfile);
  const removeContract = useServerFn(deleteContract);

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["account"],
    queryFn: () => fetchAccount(),
  });
  const unlocked = account?.unlockedTier ?? 0;
  const hasAccess = unlocked >= 1;

  const { data: contracts } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => fetchContracts(),
    enabled: hasAccess,
  });
  const { data: profile } = useQuery({
    queryKey: ["business-profile"],
    queryFn: () => fetchProfile(),
    enabled: hasAccess,
  });

  async function handleDelete(id: string) {
    try {
      await removeContract({ data: { id } });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Contract deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Tier 1 module</p>
        <h1 className="mt-4 text-4xl font-semibold">Contract builder</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Seven Trinidad and Tobago agreement templates. Pick the one that matches the real
          relationship, answer the guided questions, and export a finished Word document. Every
          placeholder must be filled before export.
        </p>

        {accountLoading && <p className="mt-6 text-sm text-muted-foreground">Checking access…</p>}

        {!accountLoading && !hasAccess && (
          <div className="panel mt-8 flex flex-col items-start gap-4 p-7">
            <p className="inline-flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" /> The contract builder is part of
              Tier 1.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Unlock Tier 1 (free) <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {hasAccess && (
          <>
            <section className="panel mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold">Business profile</p>
                  <p className="text-sm text-muted-foreground">
                    {profile
                      ? `${profile.legal_name} — used to pre-fill your side of every contract.`
                      : "Set up your business details once and they pre-fill every contract."}
                  </p>
                </div>
              </div>
              <Link
                to="/business-profile"
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/60"
              >
                {profile ? "Edit profile" : "Set up profile"}
              </Link>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold">Start a new contract</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {contractForms.map((form) => (
                  <button
                    key={form.template_id}
                    onClick={() =>
                      navigate({
                        to: "/contracts/$contractId",
                        params: { contractId: "new" },
                        search: { template: form.template_id },
                      })
                    }
                    className="panel group flex flex-col p-6 text-left transition-colors hover:border-accent/60"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {form.template_id}
                    </span>
                    <span className="mt-2 text-base font-semibold">{form.title}</span>
                    <span className="mt-2 flex-1 text-sm text-muted-foreground">
                      {templateSummaries[form.template_id]}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm text-accent">
                      <Plus className="h-4 w-4" /> {form.fields.length} guided fields
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-lg font-semibold">Your contracts</h2>
              {!contracts?.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No contracts yet. Choose a template above to begin.
                </p>
              ) : (
                <div className="panel mt-4 divide-y divide-border/70">
                  {contracts.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-4 p-5">
                      <FileText className="h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-[200px] flex-1">
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.template_title}
                          {row.counterparty ? ` · ${row.counterparty}` : ""} ·{" "}
                          {new Date(row.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="rounded-full border border-border px-3 py-1 text-xs capitalize text-muted-foreground">
                        {row.status}
                      </span>
                      <Link
                        to="/contracts/$contractId"
                        params={{ contractId: row.id }}
                        search={{ template: undefined }}
                        className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent/60"
                      >
                        Open
                      </Link>
                      <button
                        onClick={() => handleDelete(row.id)}
                        aria-label={`Delete ${row.title}`}
                        className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <p className="mt-10 max-w-3xl text-xs text-muted-foreground">
              These are drafting templates, not legal advice. Obtain Trinidad and Tobago legal
              review before signature — especially for minors, copyright assignment, joint
              ownership, personally repayable advances or broad cross-collateralisation.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
