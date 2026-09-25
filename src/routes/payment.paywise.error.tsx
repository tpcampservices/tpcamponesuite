import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";

export const Route = createFileRoute("/payment/paywise/error")({
  head: () => ({
    meta: [
      { title: "Payment not completed — TP-CAMP OneSuite" },
      { name: "description", content: "Your PayWise payment was not completed. You can safely try again." },
      { property: "og:title", content: "PayWise payment not completed" },
      { property: "og:description", content: "Return to pricing to try your TP-CAMP OneSuite payment again." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ErrorPage,
});

function ErrorPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 pt-24 pb-16">
        <div className="panel p-8">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h1 className="mt-4 text-3xl font-semibold">Your payment wasn't completed</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            The payment was cancelled or couldn't be processed. Your current access hasn't changed.
            You can try again whenever you're ready.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/pricing" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Back to pricing
            </Link>
            <Link to="/dashboard" className="rounded-lg border border-border px-5 py-2.5 text-sm">
              Go to dashboard
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
