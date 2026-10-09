import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createWamCheckout, getWamCheckoutAvailability, previewWamCheckout } from "@/lib/wam-checkout.functions";
import type { BillingPeriod, PlanId, SelectedAddOn } from "@/lib/plans";

type Selection = { planId: PlanId; billingPeriod: BillingPeriod; addons: SelectedAddOn[] };

/** Returns true only for accounts the server allows to use staging card checkout. */
export function useWamStagingAvailable(signedIn: boolean) {
  const check = useServerFn(getWamCheckoutAvailability);
  const { data } = useQuery({
    queryKey: ["wam-availability"],
    queryFn: () => check(),
    enabled: signedIn,
    staleTime: 60_000,
  });
  return data?.available === true;
}

// Staging only. Every amount shown is the server's quote; the server re-derives
// and locks it again when the order is created.
export function WamStagingCheckout({ selection }: { selection: Selection }) {
  const preview = useServerFn(previewWamCheckout);
  const create = useServerFn(createWamCheckout);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["wam-preview", selection.planId, selection.billingPeriod, JSON.stringify(selection.addons)],
    queryFn: () => preview({ data: selection }),
  });

  async function pay() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await create({ data: selection });
      window.location.assign(res.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be started.");
      setBusy(false);
    }
  }

  const duration = selection.billingPeriod === "yearly" ? "12 months" : "1 month";

  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-sm" data-testid="wam-staging-checkout">
      <p className="eyebrow">Staging test checkout — not a live payment</p>
      {q.isLoading && <p className="mt-2 text-muted-foreground">Preparing your price…</p>}
      {q.isError && <p className="mt-2 text-destructive">{(q.error as Error).message}</p>}
      {q.data && (
        <>
          <dl className="mt-3 space-y-1.5">
            <Row label="Plan" value={`${q.data.planName} — ${duration}`} />
            <Row label="Subscription price" value={`US$${q.data.usdTotal.toFixed(2)}`} />
            <Row label="Checkout rate" value={`1 USD = ${q.data.exchangeRate} TTD`} />
            <Row label="You will be charged" value={`TT$${q.data.ttdAmount}`} strong />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            WAM processes this card payment in Trinidad and Tobago dollars (TTD). The TTD amount is
            locked when you continue. One-time payment; no automatic renewal.
          </p>
          <label className="mt-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I confirm I will be charged TT${q.data.ttdAmount} by WAM for this plan.</span>
          </label>
          <button
            type="button"
            onClick={pay}
            disabled={!confirmed || busy}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Opening WAM…" : "Continue to WAM to pay"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}
