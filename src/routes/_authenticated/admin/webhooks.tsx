import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { listWebhookEvents } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({
    meta: [
      { title: "PayPal Webhook Log — TP-CAMP OneSuite Admin" },
      {
        name: "description",
        content:
          "Audit every verified PayPal webhook event and the subscription status change it produced.",
      },
      { property: "og:title", content: "TP-CAMP OneSuite — PayPal webhook log" },
      { property: "og:description", content: "Verified PayPal events and resulting status changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WebhookLogPage,
});

function WebhookLogPage() {
  const fetchEvents = useServerFn(listWebhookEvents);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: () => fetchEvents(),
  });

  const forbidden = error instanceof Error && error.message.includes("Forbidden");

  if (forbidden) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 pt-24 pb-16">
          <h1 className="text-3xl font-semibold">Admin only</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This screen is restricted to super admins.
          </p>
          <Link to="/dashboard" className="mt-6 inline-block text-sm text-accent">
            Back to dashboard
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const fmt = (v: string) => new Date(v).toLocaleString();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Admin · Troubleshooting</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold">PayPal webhook log</h1>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent/60"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Every signature-verified PayPal event, the status change it produced, and any duplicate
          deliveries that were safely ignored.
        </p>

        <div className="panel mt-8 overflow-x-auto p-5">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Received</th>
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Subscription</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Status change</th>
                <th className="py-2 pr-4 font-medium">Result</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((e) => (
                <tr key={e.id} className="border-t border-border/70 align-top">
                  <td className="py-2.5 pr-4 whitespace-nowrap">{fmt(e.created_at)}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs">{e.event_type}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                    {e.subscription_reference ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                    {e.plan_id ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 capitalize">
                    {e.new_status ? `${e.previous_status ?? "—"} → ${e.new_status}` : "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        e.duplicate
                          ? "border-border text-muted-foreground"
                          : e.applied
                            ? "border-accent/50 text-accent"
                            : "border-destructive/40 text-destructive"
                      }`}
                    >
                      {e.duplicate ? "duplicate ignored" : e.applied ? "applied" : "not applied"}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground">{e.note ?? "—"}</td>
                </tr>
              ))}
              {!data?.events.length && (
                <tr>
                  <td colSpan={7} className="py-4 text-sm text-muted-foreground">
                    No webhook events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Link to="/admin/settings" className="mt-8 inline-block text-sm text-accent">
          ← PayPal settings
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
