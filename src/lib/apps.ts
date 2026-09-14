/**
 * Central application registry for the TP-CAMP suite.
 *
 * This is the ONLY place an app is defined. `tiers.ts` re-exports from here for
 * backwards compatibility, and the permission catalogue in the database uses the
 * same `key` values.
 */

export type AppSlug = "catalog" | "invoice" | "splits" | "operations" | "finance";

export type AppDefinition = {
  /** Stable key — matches `app_key` in the database permission catalogue. */
  key: AppSlug;
  name: string;
  blurb: string;
  /** Launch target for the SSO hand-off. */
  url: string;
  /** Whether the app is live in the suite. */
  enabled: boolean;
  /** Whether an active OneSuite subscription includes this app. */
  includedInSubscription: boolean;
};

export const APPS: AppDefinition[] = [
  {
    key: "catalog",
    name: "TP-CAMP Catalog",
    blurb: "Works, recordings, releases and splits",
    url: "https://catalog.tpcamponesuite.app",
    enabled: true,
    includedInSubscription: true,
  },
  {
    key: "invoice",
    name: "TP-CAMP Invoice",
    blurb: "Invoicing, receipts and supplier payables",
    url: "https://invoice.tpcamponesuite.app",
    enabled: true,
    includedInSubscription: true,
  },
  {
    key: "splits",
    name: "TP-CAMP Split Sheets",
    blurb: "Composition & master split sheet studio",
    url: "https://splits.tpcamponesuite.app",
    enabled: true,
    includedInSubscription: true,
  },
  {
    key: "operations",
    name: "TP-CAMP Operations Hub",
    blurb: "Release operations & campaign command centre",
    url: "https://operations.tpcamponesuite.app",
    enabled: true,
    includedInSubscription: true,
  },
  {
    key: "finance",
    name: "TP-CAMP Finance",
    blurb: "Double-entry accounting, budgets and royalties",
    url: "https://finance.tpcamponesuite.app",
    enabled: true,
    includedInSubscription: true,
  },
];

export const APP_KEYS = APPS.map((a) => a.key);

export function getApp(key: string): AppDefinition | null {
  return APPS.find((a) => a.key === key) ?? null;
}

export function isAppSlug(value: unknown): value is AppSlug {
  return (APP_KEYS as string[]).includes(String(value));
}
