import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { listPaywiseEvents } from "@/lib/paywise.functions";

export const Route = createFileRoute("/_authenticated/admin/paywise")({
  head: () => ({
    meta: [
      { title: "PayWise Sandbox Diagnostics — TP-CAMP OneSuite Admin" },
      { name: "description", content: "Inspect PayWise sandbox notify and callback events received by OneSuite." },
      { property: "og:title", content: "PayWise sandbox diagnostics" },
      { property: "og:description", content: "PayWise notify and callback event log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaywisePage,
});

function PaywisePage() {
  const fetchEvents = useServerFn(listPaywiseEvents);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["paywise-events"],
    queryFn: () => fetchEvents(),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Admin · PayWise sandbox</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold">PayWise diagnostics</h1>
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Events are logged only. Nothing here activates access. Sensitive fields are redacted.
        </p>

        {error ? (
          <p className="mt-8 text-sm text-destructive">
            {error instanceof Error && error.message.includes("Forbidden") ? "This screen is restricted to super admins." : "Couldn't load events."}
          </p>
        ) : null}

        {data && (
          <>
            <div className="panel mt-8 p-5 text-sm">
              <p className="eyebrow">Configuration (present / missing only)</p>
              <p className="mt-2">Environment: <span className="font-mono">{data.environment ?? "not set"}</span></p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {data.config.map((c) => (
                  <li key={c.name} className="font-mono text-xs">
                    {c.name}: <span className={c.present ? "text-accent" : "text-destructive"}>{c.present ? "present" : "missing"}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel mt-6 overflow-x-auto p-5">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr>
                    {["Received", "Channel", "Event", "PayWise ref", "OneSuite ref / order", "Processing", "Verification", "Duplicates", "Error"].map((h) => (
                      <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.events.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-muted-foreground">No PayWise events received yet.</td></tr>
                  )}
                  {data.events.map((e) => (
                    <tr key={e.id} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.received_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{e.channel}</td>
                      <td className="py-2 pr-4">{e.event_type ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{e.paywise_reference ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{e.onesuite_reference ?? "—"}{e.plan_order_id ? ` → ${e.plan_order_id.slice(0, 8)}` : ""}</td>
                      <td className="py-2 pr-4">{e.processing_status}</td>
                      <td className="py-2 pr-4">{e.verification_status}</td>
                      <td className="py-2 pr-4">{e.duplicate_count}</td>
                      <td className="py-2 pr-4 text-destructive">{e.error_message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Link to="/dashboard" className="mt-6 inline-block text-sm text-accent">← Dashboard</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
