import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ArrowRight, Clock, AlertTriangle } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getAccessState, reconcileOrder } from "@/lib/billing.functions";
import { formatMoney, type Currency } from "@/lib/plans";

export const Route = createFileRoute("/payment-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment Confirmed — TP-CAMP OneSuite" },
      {
        name: "description",
        content:
          "Your TP-CAMP OneSuite access period is active. Open your dashboard to use catalogue, splits, contracts, invoicing, campaigns and label finance.",
      },
      { property: "og:title", content: "Payment Confirmed — TP-CAMP OneSuite" },
      {
        property: "og:description",
        content: "Your TP-CAMP OneSuite access period is active. Your apps are unlocked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentSuccessPage,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

function PaymentSuccessPage() {
  const { order } = Route.useSearch();
  const fetchState = useServerFn(getAccessState);
  const reconcile = useServerFn(reconcileOrder);

  // Keep retrying the server-side capture until the purchase is finalised.
  const { data: reconciled } = useQuery({
    queryKey: ["reconcile-order", order ?? "none"],
    enabled: Boolean(order),
    queryFn: () => reconcile({ data: { orderId: order! } }),
    refetchInterval: (query) => (query.state.data?.ok ? false : 6000),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["access-state", order ?? "latest", reconciled?.ok ?? false],
    queryFn: () => fetchState({}),
    refetchInterval: (query) =>
      query.state.data?.entitlement?.status === "active" ? false : 5000,
  });

  const entitlement = data?.entitlement ?? null;
  const paidOrder = order
    ? (data?.orders ?? []).find((o) => o.reference === order)
    : (data?.orders ?? []).find((o) => o.status === "paid");
  const active = entitlement?.status === "active" && paidOrder?.status === "paid";
  const failure = reconciled && !reconciled.ok ? (reconciled.error ?? null) : null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-20">
        <div className="panel-featured p-8 sm:p-10">
          {active ? (
            <CheckCircle2 className="h-10 w-10 text-accent" />
          ) : failure ? (
            <AlertTriangle className="h-10 w-10 text-destructive" />
          ) : (
            <Clock className="h-10 w-10 text-accent" />
          )}
          <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">
            {active
              ? "Payment confirmed"
              : failure
                ? "Payment could not be completed"
                : "Payment received — confirming with PayPal"}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {active
              ? "Thank you — your access period is verified and active. This is a one-time payment: PayPal will never charge you automatically. We'll remind you before your access period ends so you can renew when you're ready."
              : failure
                ? "PayPal declined to complete this payment, so nothing was charged and no access period was started. You can try again, or use a different PayPal account or card."
                : "Thank you. We're verifying your payment with PayPal. Access unlocks automatically the moment it's confirmed — this page updates on its own."}
          </p>
          {failure && (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {failure}
            </p>
          )}

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Plan</dt>
              <dd className="mt-2 text-sm">
                {entitlement?.planName ?? (isLoading ? "…" : "—")}
                {entitlement?.billingPeriod
                  ? ` — ${entitlement.billingPeriod === "monthly" ? "1 month" : "12 months"}`
                  : ""}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Amount paid</dt>
              <dd className="mt-2 text-sm">
                {paidOrder
                  ? formatMoney(paidOrder.currency as Currency, paidOrder.total)
                  : isLoading
                    ? "…"
                    : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <dt className="eyebrow">Access expires</dt>
              <dd className="mt-2 text-sm">
                {entitlement?.expiryDate ? formatDate(entitlement.expiryDate) : "Pending"}
              </dd>
            </div>
          </dl>

          {order && (
            <p className="mt-6 font-mono text-xs tracking-wide break-all text-muted-foreground">
              PayPal order reference: {order}
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
