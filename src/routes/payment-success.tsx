import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ArrowRight, Clock } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getSubscriptionSummary } from "@/lib/paypal.functions";
import { plan } from "@/lib/tiers";

export const Route = createFileRoute("/payment-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    sub: typeof search.sub === "string" ? search.sub : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment Confirmed — TP-CAMP OneSuite" },
      {
        name: "description",
        content:
          "Your TP-CAMP OneSuite subscription is active. Open your dashboard to unlock catalogue, splits, contracts, invoicing, campaigns and label finance.",
      },
      { property: "og:title", content: "Payment Confirmed — TP-CAMP OneSuite" },
      {
        property: "og:description",
        content: "Your TP-CAMP OneSuite subscription is active. Your apps are unlocked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const { sub } = Route.useSearch();
  const fetchSummary = useServerFn(getSubscriptionSummary);

  const { data, isLoading } = useQuery({
    queryKey: ["subscription-summary", sub ?? "latest"],
    queryFn: () => fetchSummary({ data: { subscriptionId: sub } }),
    refetchInterval: (query) =>
      query.state.data && "status" in query.state.data && query.state.data.status !== "active"
        ? 5000
        : false,
  });

  const summary = data?.found ? data : null;
  const active = summary?.status === "active";
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-20">
        <div className="panel-featured p-8 sm:p-10">
          {active ? (
            <CheckCircle2 className="h-10 w-10 text-accent" />
          ) : (
            <Clock className="h-10 w-10 text-accent" />
          )}
          <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">
            {active ? "Payment confirmed" : "Payment received — confirming with PayPal"}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {active
              ? "Thank you — your TP-CAMP OneSuite subscription is verified and active. Every app in the suite is unlocked from your dashboard."
              : "Thank you. We're verifying your payment with PayPal. Access unlocks automatically the moment it's confirmed — this page updates on its own."}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Plan</dt>
              <dd className="mt-2 text-sm">
                {plan.name}
                {summary ? ` — ${summary.cycle === "monthly" ? "Monthly" : "Yearly"}` : ""}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Amount</dt>
              <dd className="mt-2 text-sm">
                {summary?.amount != null
                  ? `${summary.currency} $${Number(summary.amount).toLocaleString()}`
                  : isLoading
                    ? "…"
                    : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Next billing date</dt>
              <dd className="mt-2 text-sm">
                {summary?.nextBillingDate ? formatDate(summary.nextBillingDate) : "Pending"}
              </dd>
            </div>
          </dl>

          {sub && (
            <p className="mt-6 font-mono text-xs tracking-wide break-all text-muted-foreground">
              PayPal subscription reference: {sub}
            </p>
          )}

          <Link
            to="/dashboard"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
