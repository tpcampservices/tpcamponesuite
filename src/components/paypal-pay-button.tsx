import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  cancelOrder,
  captureOrder,
  createOrder,
  getPaypalClientConfig,
} from "@/lib/billing.functions";
import type { AddOnId, BillingPeriod, Currency, PlanId } from "@/lib/plans";

const sdkPromises = new Map<string, Promise<void>>();

/** One-time checkout SDK — no vault, no subscription intent. */
function loadPaypalSdk(clientId: string, currency: Currency) {
  if (typeof window === "undefined") return Promise.resolve();
  const cacheKey = `${clientId}:${currency}`;
  const existingPromise = sdkPromises.get(cacheKey);
  if (existingPromise) return existingPromise;
  const promise = new Promise<void>((resolve, reject) => {
    const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture&components=buttons&disable-funding=credit`;
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
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.body.appendChild(script);
  });
  sdkPromises.set(cacheKey, promise);
  return promise;
}

export type PaySelection = {
  planId: PlanId;
  billingPeriod: BillingPeriod;
  currency: Currency;
  addons: { id: AddOnId; quantity: number }[];
};

export function PaypalPayButton({ selection }: { selection: PaySelection }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const create = useServerFn(createOrder);
  const capture = useServerFn(captureOrder);
  const cancel = useServerFn(cancelOrder);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest selection available to PayPal callbacks without re-rendering buttons.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    let cancelled = false;
    const node = containerRef.current;
    if (!node) return;
    node.innerHTML = "";
    setError(null);

    loadPaypalSdk(selection.currency)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const paypal = (window as any).paypal;
        if (!paypal?.Buttons) return;
        paypal
          .Buttons({
            style: { shape: "rect", color: "gold", layout: "vertical", label: "pay", height: 48 },
            createOrder: async () => {
              const result = await create({ data: selectionRef.current });
              return result.orderId;
            },
            onApprove: async (data: { orderID: string }) => {
              try {
                const result = await capture({ data: { orderId: data.orderID } });
                if (!result.ok) {
                  toast.error("PayPal did not complete the payment. Please try again.");
                  return;
                }
                navigate({ to: "/payment-success", search: { order: data.orderID } });
              } catch (err) {
                console.error(err);
                toast.error(
                  "Payment received, but activation needs a moment. Reference " + data.orderID,
                );
                navigate({ to: "/payment-success", search: { order: data.orderID } });
              }
            },
            onCancel: async (data: { orderID?: string }) => {
              if (data?.orderID) await cancel({ data: { orderId: data.orderID } }).catch(() => {});
              toast("Checkout cancelled — nothing was charged.");
            },
            onError: (err: unknown) => {
              console.error("PayPal error:", err);
              setError("PayPal could not complete this payment. Please try again.");
            },
          })
          .render(containerRef.current);
      })
      .catch(() => setError("PayPal could not be loaded. Please try again."));

    return () => {
      cancelled = true;
      if (node) node.innerHTML = "";
    };
    // Buttons only need re-rendering when the currency (SDK instance) changes.
  }, [selection.currency, navigate, create, capture, cancel]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full [color-scheme:light]" />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
