// WAM reconciliation orchestrator. All I/O is injected so it is fully testable;
// the webhook route wires real dependencies (wam-reconcile.server.ts).
//
// Acknowledgement model (Pattern A): reconciliation and activation complete
// synchronously BEFORE a 2xx is returned. Transient failures return 5xx so WAM
// redelivers; permanent mismatches are acknowledged and never activate.

import {
  decideReconciliation,
  type WamOrderForReconcile,
  type WamVerifiedStatus,
} from "./wam-checkout.core";
import type { VerifiedPayment } from "./paid-order.core";

export type ReconcileDeps = {
  getStatus(paymentId: string): Promise<WamVerifiedStatus>;
  findOrderByPaymentId(paymentId: string): Promise<WamOrderForReconcile | null>;
  /** Atomically moves created/processing -> activating. True only for the winner. */
  claimForActivation(orderId: string): Promise<boolean>;
  releaseClaim(orderId: string, backTo: string): Promise<void>;
  updateStatus(orderId: string, paymentStatus: string, providerStatus: string): Promise<void>;
  recordRejection(orderId: string, reason: string): Promise<void>;
  applyPaidOrder(orderId: string, payment: VerifiedPayment): Promise<{ applied: boolean }>;
  now(): Date;
};

export type ReconcileResult = {
  httpStatus: number;
  outcome: string;
  orderId: string | null;
  accessChanged: boolean;
};

export async function reconcileWamPayment(
  deps: ReconcileDeps,
  input: { paymentId: string },
): Promise<ReconcileResult> {
  const paymentId = input.paymentId.trim();
  if (!paymentId) return { httpStatus: 200, outcome: "missing_payment_id", orderId: null, accessChanged: false };

  const order = await deps.findOrderByPaymentId(paymentId);
  // Unknown payment: not ours (or not yet linked). Retry-able, never activates.
  if (!order) return { httpStatus: 409, outcome: "order_not_found", orderId: null, accessChanged: false };

  let status: WamVerifiedStatus;
  try {
    status = await deps.getStatus(paymentId);
  } catch {
    return { httpStatus: 503, outcome: "status_unavailable", orderId: order.id, accessChanged: false };
  }

  const decision = decideReconciliation({ order, eventPaymentId: paymentId, status });

  if (decision.action === "reject") {
    await deps.recordRejection(order.id, decision.reason);
    return { httpStatus: 200, outcome: `rejected_${decision.reason}`, orderId: order.id, accessChanged: false };
  }
  if (decision.action === "duplicate") {
    return { httpStatus: 200, outcome: "already_paid", orderId: order.id, accessChanged: false };
  }
  if (decision.action === "update_status") {
    await deps.updateStatus(order.id, decision.paymentStatus, decision.providerStatus);
    return { httpStatus: 200, outcome: `status_${decision.paymentStatus}`, orderId: order.id, accessChanged: false };
  }

  // activate
  const claimed = await deps.claimForActivation(order.id);
  if (!claimed) {
    const again = await deps.findOrderByPaymentId(paymentId);
    if (again?.payment_status === "paid") {
      return { httpStatus: 200, outcome: "already_paid", orderId: order.id, accessChanged: false };
    }
    return { httpStatus: 409, outcome: "activation_in_progress", orderId: order.id, accessChanged: false };
  }

  const payment: VerifiedPayment = {
    provider: "wam",
    providerReference: status.paymentId,
    providerTransactionId: status.providerTransactionId,
    providerStatus: status.status,
    verifiedAt: deps.now().toISOString(),
    capturedAmount: status.amountCents / 100,
    capturedCurrency: "TTD",
    capturedAt: status.completedAt,
    captureStatus: status.status,
  };
  try {
    const res = await deps.applyPaidOrder(order.id, payment);
    return {
      httpStatus: 200,
      outcome: res.applied ? "activated" : "already_paid",
      orderId: order.id,
      accessChanged: res.applied,
    };
  } catch {
    await deps.releaseClaim(order.id, order.payment_status);
    return { httpStatus: 500, outcome: "activation_failed", orderId: order.id, accessChanged: false };
  }
}
