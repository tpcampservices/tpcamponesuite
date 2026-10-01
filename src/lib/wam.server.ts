// Server-only WAM configuration and webhook verification.
// Never import from client code. Secret values are never logged or returned.

import { WamPaymentSDK } from "@wamnow/payment-sdk";
import type { WamWebhookVerifier } from "./wam-webhook.core";

export const WAM_SECRET_NAMES = [
  "WAM_BUSINESS_ID",
  "WAM_API_KEY",
  "WAM_ENVIRONMENT",
  "WAM_WEBHOOK_SECRET",
] as const;

/** Phase 1A is limited to WAM's non-production environments. */
export const WAM_ALLOWED_ENVIRONMENTS = ["staging", "local"] as const;

type Env = Record<string, string | undefined>;

export class WamConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WamConfigError";
  }
}

export type WamEnvironmentName = (typeof WAM_ALLOWED_ENVIRONMENTS)[number];

export type WamConfig = {
  businessId: string;
  apiKey: string;
  environment: WamEnvironmentName;
};

/** Reads WAM API config at call time. Throws with a safe message when incomplete. */
export function readWamConfig(env: Env = process.env): WamConfig {
  const environment = (env["WAM_ENVIRONMENT"] ?? "").trim().toLowerCase();
  if (!(WAM_ALLOWED_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new WamConfigError(
      "WAM is limited to staging in this phase. Set WAM_ENVIRONMENT to 'staging'.",
    );
  }
  const businessId = (env["WAM_BUSINESS_ID"] ?? "").trim();
  const apiKey = (env["WAM_API_KEY"] ?? "").trim();
  const missing: string[] = [];
  if (!businessId) missing.push("WAM_BUSINESS_ID");
  if (!apiKey) missing.push("WAM_API_KEY");
  if (missing.length) {
    throw new WamConfigError(`WAM is not configured: missing ${missing.join(", ")}.`);
  }
  return { businessId, apiKey, environment: environment as WamEnvironmentName };
}

/** Returns the webhook signing secret, or null when WAM has not supplied it yet. */
export function readWamWebhookSecret(env: Env = process.env): string | null {
  const secret = (env["WAM_WEBHOOK_SECRET"] ?? "").trim();
  return secret.length > 0 ? secret : null;
}

/** Presence-only configuration report. Never includes secret values. */
export function wamSecretPresence(env: Env = process.env) {
  return Object.fromEntries(
    WAM_SECRET_NAMES.map((name) => [name, (env[name] ?? "").trim().length > 0]),
  ) as Record<(typeof WAM_SECRET_NAMES)[number], boolean>;
}

/**
 * Official WAM webhook verification, as published by the WAM SDK.
 * The signing algorithm, header values and timestamp tolerance are WAM's;
 * nothing here is re-implemented or guessed.
 */
export const verifyWamWebhook: WamWebhookVerifier = ({
  payload,
  signature,
  timestamp,
  secret,
}) => WamPaymentSDK.verifyWebhookSignature({ payload, signature, timestamp, secret });

export const WAM_SIGNATURE_HEADER = "x-wam-signature";
export const WAM_TIMESTAMP_HEADER = "x-wam-timestamp";
