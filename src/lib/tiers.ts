export type AppLink = { name: string; url: string; blurb: string };

export type Tier = {
  id: string;
  level: 1 | 2 | 3;
  name: string;
  tagline: string;
  usd: number;
  ttd: number;
  usdMonthly: number;
  ttdMonthly: number;
  summary: string;
  highlights: string[];
  apps: AppLink[];
  featured?: boolean;
};

export const tiers: Tier[] = [
  {
    id: "tier-1",
    level: 1,
    name: "Tier 1 — Catalogue & Business",
    tagline: "Entry access for emerging independents",
    usd: 300,
    ttd: 2000,
    usdMonthly: 30,
    ttdMonthly: 200,
    summary:
      "Full catalogue management, split sheets and an invoicing system to keep track of expenses and client billing.",
    highlights: [
      "Works, Recordings & Releases with CSV bulk import and spreadsheet export",
      "Writer / composer / publisher and performer / producer / investor splits",
      "Invoices, Quotations and Receipts with conversion workflow",
      "Customer directory, company selector and branded PDF export",
      "Supplier payables: bills, payment vouchers, payments and dashboard",
      "Split Sheet Studio: composition + master sheets, contributor roster, version history, ZIP export",
    ],
    apps: [
      {
        name: "TP-CAMP Catalog",
        url: "https://tpcampcatalog.lovable.app/",
        blurb: "Works, recordings, releases and splits",
      },
      {
        name: "TP-CAMP Invoice",
        url: "https://tpcampinvoice.lovable.app/",
        blurb: "Invoicing, receipts and supplier payables",
      },
      {
        name: "TP-CAMP Split Sheets",
        url: "https://tpcampsplitsheets.lovable.app/",
        blurb: "Composition & master split sheet studio",
      },
    ],
  },
  {
    id: "tier-2",
    level: 2,
    name: "Tier 2 — Campaign Operations",
    tagline: "Campaign / marketing engagement",
    usd: 500,
    ttd: 3700,
    usdMonthly: 50,
    ttdMonthly: 370,
    summary:
      "Everything in Tier 1, plus the TP-CAMP Operations Hub — a command centre for release workflows, tasks and approvals.",
    highlights: [
      "Everything in Tier 1",
      "Projects with artist, client, label, stage, priority and budget",
      "Reusable workflow templates for DSP release, rights registration and campaigns",
      "Advanced task drawer: subtasks, checklists, dependencies, files, comments, time & KPIs",
      "Approvals module for artwork, audio, metadata and marketing",
      "Unified calendar, my-tasks view, readiness scoring and activity audit trail",
    ],
    apps: [
      {
        name: "TP-CAMP Workflow",
        url: "https://tpcampworkflow.lovable.app/",
        blurb: "Release operations & campaign command centre",
      },
    ],
    featured: true,
  },
  {
    id: "tier-3",
    level: 3,
    name: "Tier 3 — Full Finance Management",
    tagline: "The complete label back office",
    usd: 700,
    ttd: 5000,
    usdMonthly: 70,
    ttdMonthly: 500,
    summary:
      "Everything in Tiers 1 and 2, plus double-entry label accounting, budgets, forecasts and royalty imports.",
    highlights: [
      "Everything in Tiers 1 & 2",
      "Pre-seeded label chart of accounts and balanced journal entries",
      "General ledger, trial balance, income statement, balance sheet and cash flow",
      "Artists, releases and campaigns with budget-vs-spend and recoupment tracking",
      "Release P&L with revenue, direct costs, profit, ROI and recoupment %",
      "Forecasts with scenarios plus royalty CSV/XLSX import posted to journals",
    ],
    apps: [
      {
        name: "TP-CAMP Finance",
        url: "https://tpcampfinance.lovable.app/",
        blurb: "Double-entry accounting, budgets and royalties",
      },
    ],
  },
];

export type CompareRow = { feature: string; t1: boolean | string; t2: boolean | string; t3: boolean | string };

export type CompareGroup = { group: string; rows: CompareRow[] };

export const compareGroups: CompareGroup[] = [
  {
    group: "Catalogue management",
    rows: [
      { feature: "Works, recordings & releases", t1: true, t2: true, t3: true },
      { feature: "Writer / publisher & performer splits", t1: true, t2: true, t3: true },
      { feature: "CSV bulk import & spreadsheet export", t1: true, t2: true, t3: true },
      { feature: "Lyrics upload & linked recordings", t1: true, t2: true, t3: true },
    ],
  },
  {
    group: "Split sheets",
    rows: [
      { feature: "Composition & master split sheets", t1: true, t2: true, t3: true },
      { feature: "Reusable contributor roster", t1: true, t2: true, t3: true },
      { feature: "Version history & restore", t1: true, t2: true, t3: true },
      { feature: "PDF and bulk ZIP export", t1: true, t2: true, t3: true },
    ],
  },
  {
    group: "Invoicing & payables",
    rows: [
      { feature: "Invoices, quotations & receipts", t1: true, t2: true, t3: true },
      { feature: "Customer directory & company profiles", t1: true, t2: true, t3: true },
      { feature: "Branded PDF export", t1: true, t2: true, t3: true },
      { feature: "Supplier bills & payment vouchers", t1: true, t2: true, t3: true },
      { feature: "Payables dashboard", t1: true, t2: true, t3: true },
    ],
  },
  {
    group: "Campaign operations",
    rows: [
      { feature: "Projects & release stages", t1: false, t2: true, t3: true },
      { feature: "Workflow templates", t1: false, t2: true, t3: true },
      { feature: "Advanced task drawer (9 tabs)", t1: false, t2: true, t3: true },
      { feature: "Approvals module", t1: false, t2: true, t3: true },
      { feature: "Unified campaign calendar", t1: false, t2: true, t3: true },
      { feature: "Activity audit trail", t1: false, t2: true, t3: true },
    ],
  },
  {
    group: "Finance management",
    rows: [
      { feature: "Chart of accounts & journal entries", t1: false, t2: false, t3: true },
      { feature: "General ledger & trial balance", t1: false, t2: false, t3: true },
      { feature: "Income statement, balance sheet, cash flow", t1: false, t2: false, t3: true },
      { feature: "Release P&L, ROI & recoupment", t1: false, t2: false, t3: true },
      { feature: "Department budgets & forecasts", t1: false, t2: false, t3: true },
      { feature: "Royalty CSV/XLSX import", t1: false, t2: false, t3: true },
    ],
  },
  {
    group: "Access",
    rows: [
      { feature: "Included applications", t1: "3 apps", t2: "4 apps", t3: "5 apps" },
      { feature: "Monthly price (USD)", t1: "$30", t2: "$50", t3: "$70" },
      { feature: "Monthly price (TTD)", t1: "$200", t2: "$370", t3: "$500" },
      { feature: "Yearly price (USD)", t1: "$300", t2: "$500", t3: "$700" },
      { feature: "Yearly price (TTD)", t1: "$2,000", t2: "$3,700", t3: "$5,000" },
    ],
  },
];
