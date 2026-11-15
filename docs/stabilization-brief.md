# Kora Kaagaz Studio: stabilization and payments brief

The generic "complete audit" prompt, rewritten for this app. Use it as the brief for audits and stabilization passes.

## The product (what "correct" means here)

- **Kora Kaagaz Studio** is the agency tool for a 2–10 person branding, photography and visual-production studio. It lives at app.korakaagaz.co.
- **Stack:** Next.js 15 on Vercel (team `kora-kaagaz`), with Supabase (Postgres + RLS, Mumbai) behind it. It must keep costing ₹0.
- **Roles:**
  - **admin:** all money.
  - **member:** projects, sales, quotes. No invoices, payments, pay or HR data.
  - **viewer:** read-only member.
  - **freelancer:** only the projects they are on.
  - **client:** portal via magic link.
  - The database enforces these rules (RLS). The UI only hides things.
- **How money works:**
  - Projects are billed as a **fixed fee** or a **monthly retainer**. Nothing is hourly; hour budgets were removed on 2026-11-15.
  - Money comes in as **payments**. A payment sits on a GST invoice, on a project with no invoice, or both. A receipt voucher records an advance.
  - Money goes out as **expenses**: bills, receipts, claims, and each project's **team split**.
  - Totals are in INR. Foreign-currency invoices are converted at their fx rate.
- **Real data exists in production** (clients, projects, team members). There is no separate staging. Every test must create its own rows and delete them afterwards.

## Priority 1: payments (money in)

1. One **Payments** page (admin) where all incoming money is recorded and reviewed:
   - **Record:** pick a project or invoice (searchable, sorted by most owed). The amount defaults to what's pending. Then method (UPI, bank, cash, cheque, card, wire, other), reference/UTR, date, note, and an optional attached invoice file.
   - **History:** every payment, with filters for date, client, project and method. Each payment has a printable receipt. Deleting a payment needs a confirmation and is kept in the audit log.
   - **Pending:** every project and invoice that still owes money, with the amount and how long it has been owed.
   - **Overview:** collected today, this month and this FY; pending; split by method.
2. **Financial integrity.** The database must enforce these, not only the UI:
   - A double-click or retry never records the same payment twice (request id).
   - An invoice can't be paid beyond its balance, even with two people recording at once (row lock in the database).
   - A project payment above the fee needs an explicit "record anyway" (for extra work).
   - A failed save never shows success. Amounts are `numeric(14,2)` and rounded once.
3. **One number everywhere:** the same payment must show the same amount on the project, invoice, Payments, Home, Reports and CSV exports.

## Priority 2: audit the rest

- Walk every workflow as admin, member and freelancer, on desktop and phone: projects/tasks, quotes → invoices → credit notes, expenses/claims/GST/TDS, CRM, agreements/e-sign, calendar/leave, settings.
- For each workflow check that it saves, survives a refresh, updates the screens that depend on it, rejects bad input, and refuses the wrong role.
- Edge cases: empty data, more than 1,000 rows (Supabase silently stops at 1,000), double clicks, expired sessions, deleted related records.
- Rank findings P0 (money or data loss, security) → P3 (polish). Fix P0 and P1 first, at the root cause, with a test for each.

## UX rules

- Don't redesign. Keep the existing tokens and components (`src/components/ui`). No `window.confirm`, no hard-coded brand hex (`ui-audit` fails on both).
- Fewest steps: anything you do every day (record a payment, pay the team) is one click from **+ New**.
- Number fields start empty, not at 0. Buttons disable while saving. Toasts show both success and the real error.

## Testing (existing tools; no new frameworks needed)

- **Unit tests:** `vitest` (`src/lib/*.test.ts`) for the money maths.
- **Browser and data suites, safe on production:**
  - `scripts/security-test.mjs` (RLS)
  - `e2e-projects`, `e2e-money`, `e2e-crm`, `e2e-agreements` (Puppeteer through the real UI and database)
  - `ui-audit` (every page on desktop and phone)
  - `perf-check`
- Run them on production after every deploy: `node --env-file=.env.local scripts/<suite>.mjs https://app.korakaagaz.co`.
- **Never** run `scripts/e2e.mjs`; it wipes the workspace.

## Cleanup

- **Never reset production.** Delete only leftovers that test scripts left behind: names starting with E2E / Sec / DBG, and `@example.com` people.
- Back up those rows as JSON before deleting them. Real clients, projects, payments and members are never touched without explicit approval.

## Done means

- Payments record reliably, and the same figures appear on every screen.
- All suites pass on production; anything not verified is listed.
- `docs/architecture.html` is updated with a dated change log.
- There are no known P0 or P1 issues, or each remaining one is listed with the reason.
