import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";

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

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-20">
        <div className="panel-featured p-8 sm:p-10">
          <CheckCircle2 className="h-10 w-10 text-accent" />
          <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">Payment confirmed</h1>
          <p className="mt-4 text-muted-foreground">
            Thank you — your TP-CAMP OneSuite subscription is now active. Every app in the suite is
            unlocked from your dashboard.
          </p>
          {sub && (
            <p className="mt-4 font-mono text-xs tracking-wide text-muted-foreground break-all">
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
