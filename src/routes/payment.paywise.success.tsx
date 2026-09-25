import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";

export const Route = createFileRoute("/payment/paywise/success")({
  head: () => ({
    meta: [
      { title: "Confirming your payment — TP-CAMP OneSuite" },
      { name: "description", content: "We're confirming your PayWise transaction with TP-CAMP OneSuite." },
      { property: "og:title", content: "Confirming your PayWise payment" },
      { property: "og:description", content: "Your TP-CAMP OneSuite payment is being confirmed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

// This page is informational only. Arriving here is NOT proof of payment and
// it makes no server call that could activate access.
function SuccessPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pt-24 pb-16">
        <div className="panel-featured p-8">
          <Clock className="h-8 w-8 text-accent" />
          <h1 className="mt-4 text-3xl font-semibold">
            Payment received. We're confirming your PayWise transaction.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Your access isn't active yet. It starts only after we've confirmed the payment directly
            with PayWise. You don't need to pay again. Check your dashboard shortly.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/dashboard" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Go to dashboard
            </Link>
            <Link to="/contact" className="rounded-lg border border-border px-5 py-2.5 text-sm">
              Contact support
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
