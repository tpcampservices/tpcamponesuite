import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { tiers } from "@/lib/tiers";
import { getMyAccount, startCheckout } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your TP-CAMP Dashboard — Tier Access & Apps" },
      {
        name: "description",
        content: "Manage your TP-CAMP subscription tier and open the applications included in your plan.",
      },
      { property: "og:title", content: "TP-CAMP Dashboard" },
      { property: "og:description", content: "Tier access, subscriptions and app links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchAccount = useServerFn(getMyAccount);
  const checkout = useServerFn(startCheckout);
  const queryClient = useQueryClient();
  const [pendingTier, setPendingTier] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["account"],
    queryFn: () => fetchAccount(),
  });

  async function handleCheckout(tier: number) {
    setPendingTier(tier);
    try {
      const result = await checkout({
        data: { tier, currency: "USD", returnUrl: window.location.href },
      });
      if (result.configured && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      toast.success(
        `Order created (ref ${result.reference}). The payment portal isn't linked yet — access unlocks once payment is confirmed.`,
      );
      queryClient.invalidateQueries({ queryKey: ["account"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setPendingTier(null);
    }
  }

  const unlocked = data?.unlockedTier ?? 0;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pt-16 pb-16">
        <p className="eyebrow">Your account</p>
        <h1 className="mt-4 text-4xl font-semibold">Dashboard</h1>
        {data?.isSuperAdmin && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/50 px-4 py-1.5 text-sm text-accent">
            <ShieldCheck className="h-4 w-4" /> Super admin — all tiers unlocked
          </p>
        )}
        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading your access…</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => {
            const isUnlocked = unlocked >= tier.level;
            const pending = data?.subscriptions.some(
              (s) => s.tier === tier.level && s.status === "pending",
            );
            return (
              <article key={tier.id} className="panel flex flex-col p-7">
                <h2 className="text-lg font-semibold">{tier.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  ${tier.usd.toLocaleString()} USD / TTD ${tier.ttd.toLocaleString()} per year
                </p>

                <div className="mt-5 flex-1 space-y-2">
                  {tier.apps.map((app) =>
                    isUnlocked ? (
                      <a
                        key={app.url}
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/60"
                      >
                        <span>
                          <span className="block text-sm font-medium">{app.name}</span>
                          <span className="block text-xs text-muted-foreground">{app.blurb}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-accent" />
                      </a>
                    ) : (
                      <div
                        key={app.url}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/50 px-4 py-3 opacity-70"
                      >
                        <span>
                          <span className="block text-sm font-medium">{app.name}</span>
                          <span className="block text-xs text-muted-foreground">{app.blurb}</span>
                        </span>
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    ),
                  )}
                </div>

                {isUnlocked ? (
                  <p className="mt-6 rounded-lg border border-accent/40 px-4 py-2.5 text-center text-sm text-accent">
                    Access active
                  </p>
                ) : (
                  <button
                    onClick={() => handleCheckout(tier.level)}
                    disabled={pendingTier === tier.level}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {pendingTier === tier.level
                      ? "Starting…"
                      : pending
                        ? "Awaiting payment — retry"
                        : "Get access"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Need help choosing?{" "}
          <Link to="/compare" className="text-accent">
            Compare the tiers
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
