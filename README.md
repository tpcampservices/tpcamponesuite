# TP Camp Creative Suite

I need to build a website that link to separate app as the Tier goes up (yearly Subscibtions)




The website will have its Pricing Page, also A Compare tier Chart

Tier 1

USD $300

TTD $2,000

Entry access for emerging independents. Full catalogue management , Split Sheets and invoice System to keep track of Expenses and Billing of Clients




Catalog Management Features ;manage Works (metadata, writer/composer/publisher splits, lyrics upload, linked recordings), Recordings (performer/producer/label/investor shares), and Releases (track listings), each with CSV bulk import and spreadsheet export.




Invoicing System

- Create / edit / delete Invoices, Quotations, and Receipts

- Customer directory with reusable bill-to details (name, email, phone, address, notes)

- Company selector per document, with auto-filled sender info

- Line items with quantity and unit price; automatic subtotal, tax, discount, and total calculation

- Document conversion workflow:

  - Quotation → Invoice

  - Invoice → Receipt (marks paid)

- Status tracking: draft, sent, paid

- PDF export with embedded company logo, brand accent color, and full invoice styling

- Document list filtered by type, company, and search




Company Setup

- Preloaded with your  companies

Supplier Payables

- Supplier directory with contact, banking, tax, currency, payment method, and type

- Supplier bills with line items, tax, discount, totals, and duplicate-invoice warning

- Payment Vouchers for internal authorization before payment

- Payments recorded against bills/vouchers with balance validation

- Auto-numbering: `SB-YYYY-NNNN`, `PV-YYYY-NNNN`, `PAY-YYYY-NNNN`

- Payables dashboard showing:

  - Unpaid bills

  - Overdue bills

  - Bills awaiting approval

  - Payments made this month

  - Active suppliers

- PDF export for Payment Vouchers and Payment Advice / Remittance slips

- Bill status lifecycle: draft → awaiting approval → approved → partially paid / paid / overdue / rejected / cancelled

Split Sheet System ; Let me review the full codebase to give you an accurate feature list.




Here's a complete rundown of everything your Split Sheet Studio app currently does:




📄 Two document types

- Composition Split Sheets (copyright) — for songwriters, composers & publishers

- Sound Recording Split & Metadata Sheets (master) — for performers, producers, engineers & label info




✏️ Editor (`/sheet/:id`)

- Auto-save (debounced) as you type, with a "Saved at…" timestamp

- Live share total that turns red unless it equals 100%

- Composition fields: title, alt title, ISWC, written date, language, genre, duration, studio + writers (legal name, stage name, role, IPI/CAE, CMO/PRO, publisher + publisher IPI/CMO, email, address, share %)

- Master fields: title, artist, ISRC, UPC/EAN, label, producer, engineer, studio, recorded/released dates, duration, genre, BPM, key, ℗ line, © line + performers (name, stage name, ISNI, IPI, role, label, contact, share %)

- Add/remove unlimited writer or performer rows

- Notes section on every sheet




👥 Contributor roster (`/contributors`)

- Reusable people library stored once, reused across sheets

- Fields: legal name, stage name, default role, DOB, IPI, ISNI, CMO/PRO, publisher + publisher IPI/CMO, email, phone, address, notes

- Searchable list (by name, IPI, ISNI, email, CMO, publisher)

- Auto-saving edit form

- Import from Contributors picker inside both editors — multi-select roster members to bulk-add to a sheet (auto-skips people already on it)




🕓 Version history

- Every save records a version snapshot (15-second edit coalescing, 50-version cap per sheet)

- History side-drawer to preview past versions and restore any one




📤 Export

- Single-sheet PDF export (jsPDF) — professional layout with headers, metadata tables, share totals, notes, signature lines, and page footers

- Multi-select ZIP export on the dashboard — select several sheets and download a ZIP with `composition/` and `master/` subfolders




📥 Bulk import

- Paste or upload a CSV (or load a built-in template/example)

- Rows grouped by `type` + `title` into multiple sheets at once

- Auto-matches contributors from your roster by IPI or legal/stage name and pre-fills their fields

- Live preview: sheet count, matched/unmatched, errors, per-sheet contributor + share summary before importing

- Downloadable CSV template




🗂️ Dashboard (`/`)

- Filter by All / Composition / Master with counts

- Sheet cards showing type badge, contributor count, total share (red if ≠100%), last-updated date

- Multi-select with bulk Export ZIP and bulk Delete

- Empty-state with quick-create options







Tier 2

USD $500

TTD $3,700

Campaign / marketing engagement.

TP-CAMP Operations Hub is an internal music-release operations and campaign workflow manager — a "command centre" for a rights-management / label-services company. It answers five questions at a glance: which projects are active, what needs to happen next, who owns each task, what's blocked or awaiting approval, and whether a release is ready, registered, distributed and promoted.




Stack

- Built with TanStack Start v1, React 19, TypeScript and Tailwind CSS v4.

- Backend is Lovable Cloud / Supabase with Row-Level Security.

- Dark command-centre UI (`#0B0F14`, `#141B26`, `#E8EDF2`, `#6EE7B7`).




Core data

- Projects — artist, client, label, release date, stage, priority, budget, links.

- Workflow templates — reusable task sequences for DSP release, rights registration and full campaigns.

- Tasks — rich task records with categories, statuses, deadlines, dependencies, assignees, checklists, subtasks, time tracking, KPIs, comments and attachments.

- Approvals — artwork, audio, metadata, marketing, etc., with status, deadlines, submission links and requested changes.

- Activity logs — audit trail of changes.




Live features

- Auth with sign-up / sign-in and password reset.

- Dashboard showing today's work, overdue items, this week and projects by stage.

- Project workspace with stage management, readiness score and dependency-aware task list.

- Advanced task drawer (Phase 1) with 9 tabs: Details, Subtasks, Checklist, Dependencies, Files, Comments, Time, Approvals and Activity.

- Approvals module with filters and per-project inline tracking.

- Unified calendar showing release dates, campaign windows, task due dates and approval deadlines/decisions.

- My tasks view, editable workflow templates, project/task editing and deletion.




Current state

Phase 1 (advanced task editor + database extensions) is complete and running. The next planned phases are board/gantt/workload views, dashboard command-centre widgets, automations/intake forms, and permissions/real-time sync.







Tier 3

USD $700

TTD $5,000

Full Finance Management System 

Chart of accounts — the full label chart pre-seeded (Assets, Liabilities, Equity, Revenue, Direct costs, Operating, Other)

Journal entries — balanced double-entry form with account picker, per-line dimensions (artist, release, campaign, DSP, territory, recoupable flag)

General ledger + Trial balance — every posted transaction, grouped by account with debit/credit totals

Financial statements — Income statement, Balance sheet, Cash flow

Label modules — Artists (with royalty rate + recoupment balance), Releases (with recording/marketing/video budgets), Campaigns (with budget-vs-spend tracking + over-budget alerts)

Release P&L report — revenue, direct costs, profit, ROI and recoupment % per release

Dashboard — cash, revenue/expenses this month, AR/AP, royalties payable, unrecouped advances, 12-month revenue vs expenses chart

Releases, Campaigns, Departments — each showing budget, actual, variance, % used, and status (On track / At risk / Over). Click any row to drill into the underlying posted journal lines in a side sheet.

To budget operating departments (e.g. Marketing, A&R, G&A), open Planning → Department budgets and add rows scoped to an operating account + period; actuals come from posted journal lines on that account within the period.

Forecasts page is live at Planning → Forecasts with 3/6/12-month horizons, Conservative/Base/Optimistic scenarios, revenue and expense adjustment sliders, an actual-vs-forecast chart with cumulative cash line, a monthly detail table, and CSV/PDF export.

Royalty import is live at Royalties → Royalty imports. Upload a CSV/XLSX, auto-mapped columns (ISRC, track, DSP, territory, units, gross/net, currency, period), set FX rate + revenue/receivable accounts, preview with ISRC-match validation, then commit to post a balanced journal entry with per-line DSP/territory/track/release/artist dimensions




The App Must have buttons or tab for the tiers which wil then carry you to their perspective all as listed below





Main Tier 




https://tpcampcatalog.lovable.app/

https://tpcampinvoice.lovable.app/

https://tpcampsplitsheets.lovable.app/




Tier 2

https://tpcampworkflow.lovable.app/




Tier 3




https://tpcampfinance.lovable.app/

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tpcamponesuite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/78e0852d-a4cf-409c-9124-a9a045dc4411).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
