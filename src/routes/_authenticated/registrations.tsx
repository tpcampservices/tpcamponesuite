import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileCheck2, RefreshCw } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildRegistrationProfile, getRegistrationHub } from "@/lib/registration.functions";

export const Route = createFileRoute("/_authenticated/registrations")({
  head: () => ({
    meta: [
      { title: "Rights Registration Hub — TP-CAMP OneSuite" },
      { name: "description", content: "Prepare and track society registrations from your Catalog and Split Sheets data." },
      { property: "og:title", content: "Rights Registration Hub — TP-CAMP OneSuite" },
      { property: "og:description", content: "Registration profiles, validation and status history for your works." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegistrationHubPage,
});

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString() : "—";
}

function RegistrationHubPage() {
  const fetchHub = useServerFn(getRegistrationHub);
  const build = useServerFn(buildRegistrationProfile);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["registration-hub"], queryFn: () => fetchHub() });
  const canPrepare = data?.permissions.includes("splits.registration.prepare");

  async function onBuild(workId: string) {
    setBusy(workId);
    try {
      const r = await build({ data: { workId } });
      toast.success(r.reused ? "Nothing changed — profile is up to date." : `Profile revision ${r.revision} created.`);
      await qc.invalidateQueries({ queryKey: ["registration-hub"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the profile.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <FileCheck2 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold">Rights Registration Hub</h1>
            <p className="text-sm text-muted-foreground">
              Work details come from Catalog and ownership from Split Sheets. They are read here, never edited.
              Nothing is sent to any society from this screen yet.
            </p>
          </div>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {data && !data.allowed && (
          <div className="rounded-lg border border-border bg-card p-6 text-sm">
            You don't have access to the Registration Hub in this workspace. Ask your workspace owner for registration permissions.
          </div>
        )}
        {data?.allowed && data.works.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            No works have been received from Catalog or Split Sheets yet. Works appear here once those apps send their details.
          </div>
        )}
        {data?.allowed && data.works.length > 0 && (
          <div className="space-y-4">
            {data.works.map((w) => (
              <div key={w.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">{w.title ?? "Untitled work"}</h2>
                    <p className="text-xs text-muted-foreground">Work ID {w.workUid}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {w.stale && <Badge variant="destructive">Out of date</Badge>}
                    {w.validationPassed === true && <Badge>Ready</Badge>}
                    {w.validationPassed === false && <Badge variant="secondary">Needs attention</Badge>}
                    {w.profileRevision === null && <Badge variant="outline">No profile yet</Badge>}
                    {canPrepare && (
                      <Button size="sm" variant="outline" disabled={busy === w.id} onClick={() => onBuild(w.id)}>
                        <RefreshCw className="mr-1 h-3 w-3" /> Build profile
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Catalog version</dt><dd>{w.catalogRevision ?? "not received"} · {fmt(w.catalogReceivedAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Split Sheets ownership version</dt><dd>{w.ownershipRevision ?? "not received"} · {fmt(w.splitsReceivedAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Profile revision</dt><dd>{w.profileRevision ?? "—"}</dd></div>
                </dl>
                {w.issues.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm">
                    {w.issues.map((i, idx) => (
                      <li key={idx} className={i.severity === "blocking" ? "text-destructive" : "text-muted-foreground"}>
                        {i.severity === "blocking" ? "Must fix: " : "Note: "}{i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
