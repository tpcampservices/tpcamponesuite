import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { recordPaypalSubscription } from "@/lib/paypal.functions";

const PAYPAL_CLIENT_ID =
  "BAA1-dCj1JNNnjkGzwBjpSccQtPofb-B13xUlG5PBocQ3drUXYr7oNuBQheOrsrNESa8F4UB4Fy54NIj3Q";

export const PAYPAL_PLANS = {
  monthly: "P-23V27230FR240482ENKHVRFQ",
  yearly: "P-18U15029U67667611NKHVSOQ",
} as const;

let sdkPromise: Promise<void> | null = null;

function loadPaypalSdk() {
  if (typeof window === "undefined") return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if ((window as any).paypal) resolve();
      else existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-sdk-integration-source", "button-factory");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.body.appendChild(script);
  });
  return sdkPromise;
}

export function PaypalSubscribe({ cycle }: { cycle: "monthly" | "yearly" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const record = useServerFn(recordPaypalSubscription);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (!node) return;
    node.innerHTML = "";

    loadPaypalSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const paypal = (window as any).paypal;
        if (!paypal?.Buttons) return;
        paypal
          .Buttons({
            style: { shape: "rect", color: "gold", layout: "vertical", label: "subscribe" },
            createSubscription: (_data: unknown, actions: any) =>
              actions.subscription.create({ plan_id: PAYPAL_PLANS[cycle] }),
            onApprove: async (data: { subscriptionID: string }) => {
              try {
                await record({ data: { subscriptionId: data.subscriptionID, cycle } });
                navigate({ to: "/payment-success", search: { sub: data.subscriptionID } });
              } catch (err) {
                console.error(err);
                toast.error(
                  "Payment received, but we couldn't activate your account automatically. Contact support with reference " +
                    data.subscriptionID,
                );
              }
            },
            onError: (err: unknown) => {
              console.error("PayPal error:", err);
              setError("PayPal could not be loaded. Please try again.");
            },
          })
          .render(containerRef.current);
      })
      .catch(() => setError("PayPal could not be loaded. Please try again."));

    return () => {
      cancelled = true;
      if (node) node.innerHTML = "";
    };
  }, [cycle, navigate, record]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full max-w-sm [color-scheme:light]" />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
