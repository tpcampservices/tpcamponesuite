import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getWamOrderStatus } from "@/lib/wam-checkout.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/payment/wam/result")({
  validateSearch: (s: Record<string, unknown>) => ({ order: typeof s.order === "string" ? s.order : "" }),
  head: () => ({
    meta: [
      { title: "Payment status — TP-CAMP OneSuite" },
      { name: "description", content: "Check the status of your TP-CAMP OneSuite card payment." },
      { property: "og:title", content: "TP-CAMP OneSuite payment status" },
      { property: "og:description", content: "Your TP-CAMP OneSuite payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResultPage,
});

const TERMINAL = ["paid", "failed", "canceled", "expired"];
const LABELS: Record<string, string> = {
  created: "Waiting for your payment to be confirmed.",
  processing: "Your payment is being processed.",
  activating: "Payment confirmed. Activating your access…",
  paid: "Payment confirmed. Your access is active.",
  failed: "The payment did not go through. No access was granted.",
  canceled: "The payment was canceled. No access was granted.",
  expired: "The payment session expired. No access was granted.",
};

// Passive page: arriving here is never proof of payment and never activates access.
function ResultPage() {
  const { order } = Route.useSearch();
  const fetchStatus = useServerFn(getWamOrderStatus);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  const q = useQuery({
    queryKey: ["wam-order", order],
    enabled: Boolean(order) && signedIn === true,
    queryFn: () => fetchStatus({ data: { orderId: order } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.found && TERMINAL.includes(d.status) ? false : 5000;
    },
  });

  let message = "Checking your payment…";
  if (!order) message = "No order was specified.";
  else if (signedIn === false) message = "Sign in to view this payment.";
  else if (q.isError) message = "We couldn't load this payment right now.";
  else if (q.data && !q.data.found) message = "We couldn't find this payment on your account.";
  else if (q.data?.found) message = LABELS[q.data.status] ?? "Payment status is being confirmed.";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold mb-4">Payment status</h1>
        <p className="text-muted-foreground mb-6">{message}</p>
        {q.data?.found && (
          <p className="text-sm text-muted-foreground mb-6">
            Price US${q.data.usdTotal.toFixed(2)}
            {q.data.ttdAmount ? ` · charged in TT$${q.data.ttdAmount}` : ""}
          </p>
        )}
        <Link to="/dashboard" className="underline">Go to your dashboard</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
