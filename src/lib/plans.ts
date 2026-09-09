/**
 * Central, single source of truth for TP-CAMP OneSuite pricing, plan limits and add-ons.
 * TTD and USD are separate approved price books — never converted from one another.
 * The backend always re-derives price from this file; browser input is never trusted.
 */

export type Currency = "USD" | "TTD";
export type BillingPeriod = "monthly" | "yearly";
export type PlanId = "starter" | "growth" | "pro" | "institutional";
export type AddOnId = "team_add" | "professional_support" | "onboarding";

export type PlanLimits = {
  seats: number;
  catalogRecords: number;
  activeProjects: number;
  invoicesPerMonth: number;
  financeTransactionsPerMonth: number;
  contractsPerMonth: number;
  splitSheetsPerMonth: number;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  price: Record<BillingPeriod, Record<Currency, number>>;
  limits: PlanLimits;
  highlight?: boolean;
};

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For the independent artist running their own business.",
    price: {
      monthly: { TTD: 350, USD: 50 },
      yearly: { TTD: 3500, USD: 500 },
    },
    limits: {
      seats: 1,
      catalogRecords: 50,
      activeProjects: 12,
      invoicesPerMonth: 15,
      financeTransactionsPerMonth: 100,
      contractsPerMonth: 5,
      splitSheetsPerMonth: 50,
    },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For managers and small teams with a growing roster.",
    highlight: true,
    price: {
      monthly: { TTD: 560, USD: 80 },
      yearly: { TTD: 5600, USD: 800 },
    },
    limits: {
      seats: 3,
      catalogRecords: 300,
      activeProjects: 50,
      invoicesPerMonth: 75,
      financeTransactionsPerMonth: 500,
      contractsPerMonth: 10,
      splitSheetsPerMonth: 300,
    },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For labels running multiple releases and campaigns.",
    price: {
      monthly: { TTD: 1050, USD: 150 },
      yearly: { TTD: 10500, USD: 1500 },
    },
    limits: {
      seats: 8,
      catalogRecords: 1000,
      activeProjects: 100,
      invoicesPerMonth: 250,
      financeTransactionsPerMonth: 2500,
      contractsPerMonth: 50,
      splitSheetsPerMonth: 1000,
    },
  },
  {
    id: "institutional",
    name: "Institutional",
    tagline: "For collecting societies, agencies and large catalogues.",
    price: {
      monthly: { TTD: 3500, USD: 500 },
      yearly: { TTD: 35000, USD: 5000 },
    },
    limits: {
      seats: 25,
      catalogRecords: 10000,
      activeProjects: 250,
      invoicesPerMonth: 2000,
      financeTransactionsPerMonth: 20000,
      contractsPerMonth: 250,
      splitSheetsPerMonth: 10000,
    },
  },
];

export type AddOnDefinition = {
  id: AddOnId;
  name: string;
  description: string;
  /** One-time service fees are charged once and never as part of the access period. */
  oneTime: boolean;
  price: Record<BillingPeriod, Record<Currency, number>>;
  /** Extra seats granted per unit (Team Add). */
  extraSeats?: number;
};

export const ADD_ONS: AddOnDefinition[] = [
  {
    id: "team_add",
    name: "Team Add",
    description: "Additional team seats on top of your plan allowance.",
    oneTime: false,
    extraSeats: 1,
    price: {
      monthly: { TTD: 210, USD: 30 },
      yearly: { TTD: 2100, USD: 300 },
    },
  },
  {
    id: "professional_support",
    name: "Professional Support",
    description: "Priority support with a named contact and faster response times.",
    oneTime: false,
    price: {
      monthly: { TTD: 600, USD: 85 },
      yearly: { TTD: 3600, USD: 500 },
    },
  },
  {
    id: "onboarding",
    name: "Onboarding",
    description: "One-time guided setup, data import and team training.",
    oneTime: true,
    price: {
      monthly: { TTD: 750, USD: 100 },
      yearly: { TTD: 750, USD: 100 },
    },
  },
];

export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  seats: "Users / seats",
  catalogRecords: "Catalogue records",
  activeProjects: "Active projects / campaigns",
  invoicesPerMonth: "Invoices & quotations (per month)",
  financeTransactionsPerMonth: "Finance transactions (per month)",
  contractsPerMonth: "Contracts generated (per month)",
  splitSheetsPerMonth: "Split sheets (per month)",
};

/** Metrics that reset each calendar month. */
export const MONTHLY_METRICS = [
  "invoicesPerMonth",
  "financeTransactionsPerMonth",
  "contractsPerMonth",
  "splitSheetsPerMonth",
] as const;

export function getPlan(planId: string | null | undefined): PlanDefinition | null {
  return PLANS.find((p) => p.id === planId) ?? null;
}

export function getAddOn(addOnId: string): AddOnDefinition | null {
  return ADD_ONS.find((a) => a.id === addOnId) ?? null;
}

export type SelectedAddOn = { id: AddOnId; quantity: number };

export type PriceQuote = {
  planId: PlanId;
  planName: string;
  billingPeriod: BillingPeriod;
  currency: Currency;
  basePrice: number;
  addOnTotal: number;
  onboardingFee: number;
  total: number;
  lines: { id: string; label: string; quantity: number; amount: number }[];
  addons: SelectedAddOn[];
  extraSeats: number;
};

/**
 * Authoritative price calculation. Only ever call this on the server —
 * the browser sends selections, never amounts.
 */
export function quotePrice(input: {
  planId: PlanId;
  billingPeriod: BillingPeriod;
  currency: Currency;
  addons?: SelectedAddOn[];
}): PriceQuote {
  const plan = getPlan(input.planId);
  if (!plan) throw new Error("Unknown plan");

  const basePrice = plan.price[input.billingPeriod][input.currency];
  const lines: PriceQuote["lines"] = [
    {
      id: plan.id,
      label: `${plan.name} — ${input.billingPeriod === "yearly" ? "12 months" : "1 month"} access`,
      quantity: 1,
      amount: basePrice,
    },
  ];

  let addOnTotal = 0;
  let onboardingFee = 0;
  let extraSeats = 0;
  const addons: SelectedAddOn[] = [];

  for (const selected of input.addons ?? []) {
    const addOn = getAddOn(selected.id);
    if (!addOn) continue;
    const quantity = Math.max(0, Math.min(50, Math.floor(selected.quantity)));
    if (quantity < 1) continue;
    const unit = addOn.price[input.billingPeriod][input.currency];
    const amount = unit * quantity;
    if (addOn.oneTime) onboardingFee += amount;
    else addOnTotal += amount;
    if (addOn.extraSeats) extraSeats += addOn.extraSeats * quantity;
    addons.push({ id: addOn.id, quantity });
    lines.push({ id: addOn.id, label: addOn.name, quantity, amount });
  }

  return {
    planId: plan.id,
    planName: plan.name,
    billingPeriod: input.billingPeriod,
    currency: input.currency,
    basePrice,
    addOnTotal,
    onboardingFee,
    total: basePrice + addOnTotal + onboardingFee,
    lines,
    addons,
    extraSeats,
  };
}

export function formatMoney(currency: Currency, amount: number) {
  return `${currency} $${Number(amount).toLocaleString()}`;
}

/** Add one access period to a date, without restarting from today (early renewal safe). */
export function addPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from.getTime());
  if (period === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Reminder thresholds, in days before expiry. */
export const REMINDER_DAYS: Record<BillingPeriod, number[]> = {
  yearly: [30, 14, 7, 1, 0],
  monthly: [7, 3, 1, 0],
};

export function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** The reminder that should currently be shown, or null when none applies. */
export function activeReminder(
  expiryIso: string | null | undefined,
  period: BillingPeriod | null | undefined,
): { days: number; message: string } | null {
  const days = daysUntil(expiryIso);
  if (days === null || days < 0) return null;
  const thresholds = REMINDER_DAYS[period === "monthly" ? "monthly" : "yearly"];
  const hit = thresholds.find((t) => days <= t);
  if (hit === undefined) return null;
  const message =
    days <= 0
      ? "Your TP-CAMP access expires today. Renew now to keep full access."
      : days === 1
        ? "Your TP-CAMP access expires tomorrow. Renew to avoid interruption."
        : `Your TP-CAMP access expires in ${days} days. Renew when you're ready — nothing renews automatically.`;
  return { days, message };
}
