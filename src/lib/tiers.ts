export type AppSlug = "catalog" | "invoice" | "splits" | "operations" | "finance";

export type AppLink = { slug: AppSlug; name: string; url: string; blurb: string };

export type BillingCycle = "monthly" | "yearly";

export const BETA_LABEL = "Beta Version V1.0";

export const plan = {
  id: "onesuite",
  name: "TP-CAMP OneSuite",
  tagline: "One fee. Every tool in the suite.",
  yearly: { usd: 500, ttd: 3500 },
  monthly: { usd: 49, ttd: 350 },
  summary:
    "One subscription unlocks the entire TP-CAMP suite — catalogue and rights, split sheets, contracts, invoicing and payables, release operations and full double-entry label finance.",
  highlights: [
    "Works, Recordings & Releases with CSV bulk import and spreadsheet export",
    "Writer / composer / publisher and performer / producer / investor splits",
    "Split Sheet Studio: composition + master sheets, contributor roster, version history",
    "Contract builder with Trinidad and Tobago templates and a shared business profile",
    "Invoices, quotations, receipts, customer directory and branded PDF export",
    "Supplier payables: bills, payment vouchers, payments and dashboard",
    "Campaign operations: projects, workflow templates, approvals and unified calendar",
    "Double-entry accounting, general ledger, statements, budgets and forecasts",
    "Release P&L with revenue, direct costs, ROI and recoupment tracking",
    "Royalty CSV/XLSX import posted straight to your journals",
  ],
};

export const suiteApps: AppLink[] = [
  {
    name: "TP-CAMP Catalog",
    slug: "catalog",
    url: "https://catalog.tpcamponesuite.app",
    blurb: "Works, recordings, releases and splits",
  },
  {
    name: "TP-CAMP Invoice",
    slug: "invoice",
    url: "https://invoice.tpcamponesuite.app",
    blurb: "Invoicing, receipts and supplier payables",
  },
  {
    name: "TP-CAMP Split Sheets",
    slug: "splits",
    url: "https://splits.tpcamponesuite.app",
    blurb: "Composition & master split sheet studio",
  },
  {
    name: "TP-CAMP Operations Hub",
    slug: "operations",
    url: "https://operations.tpcamponesuite.app",
    blurb: "Release operations & campaign command centre",
  },
  {
    name: "TP-CAMP Finance",
    slug: "finance",
    url: "https://finance.tpcamponesuite.app",
    blurb: "Double-entry accounting, budgets and royalties",
  },
];

export type CompareRow = { feature: string; included: boolean | string };
export type CompareGroup = { group: string; rows: CompareRow[] };

export const compareGroups: CompareGroup[] = [
  {
    group: "Catalogue management",
    rows: [
      { feature: "Works, recordings & releases", included: true },
      { feature: "Writer / publisher & performer splits", included: true },
      { feature: "CSV bulk import & spreadsheet export", included: true },
      { feature: "Lyrics upload & linked recordings", included: true },
    ],
  },
  {
    group: "Split sheets",
    rows: [
      { feature: "Composition & master split sheets", included: true },
      { feature: "Reusable contributor roster", included: true },
      { feature: "Version history & restore", included: true },
      { feature: "PDF and bulk ZIP export", included: true },
    ],
  },
  {
    group: "Contracts",
    rows: [
      { feature: "Trinidad and Tobago contract templates", included: true },
      { feature: "Guided contract wizard & saved drafts", included: true },
      { feature: "Business profile auto-fill", included: true },
      { feature: "Word (.docx) export", included: true },
    ],
  },
  {
    group: "Invoicing & payables",
    rows: [
      { feature: "Invoices, quotations & receipts", included: true },
      { feature: "Customer directory & company profiles", included: true },
      { feature: "Branded PDF export", included: true },
      { feature: "Supplier bills & payment vouchers", included: true },
      { feature: "Payables dashboard", included: true },
    ],
  },
  {
    group: "Campaign operations",
    rows: [
      { feature: "Projects & release stages", included: true },
      { feature: "Workflow templates", included: true },
      { feature: "Advanced task drawer (9 tabs)", included: true },
      { feature: "Approvals module", included: true },
      { feature: "Unified campaign calendar", included: true },
      { feature: "Activity audit trail", included: true },
    ],
  },
  {
    group: "Finance management",
    rows: [
      { feature: "Chart of accounts & journal entries", included: true },
      { feature: "General ledger & trial balance", included: true },
      { feature: "Income statement, balance sheet, cash flow", included: true },
      { feature: "Release P&L, ROI & recoupment", included: true },
      { feature: "Department budgets & forecasts", included: true },
      { feature: "Royalty CSV/XLSX import", included: true },
    ],
  },
  {
    group: "Access",
    rows: [
      { feature: "Included applications", included: "All 5 apps" },
      { feature: "Monthly price", included: "$49 USD · $350 TTD" },
      { feature: "Yearly price", included: "$500 USD · $3,500 TTD" },
    ],
  },
];
