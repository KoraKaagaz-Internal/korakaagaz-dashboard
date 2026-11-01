import Link from "next/link";
import { Card } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { listCategories, listExpenses, listVendors } from "@/lib/expense-data";
import { daysBetween, formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { monthRange } from "@/lib/time";
import { loggableProjects } from "@/lib/time-data";
import { ExpenseTabs } from "./Tabs";

const KIND = { receipt: "Paid", bill: "Bill", claim: "Claim" } as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { isAdmin, canEdit } = await requireMember();
  const sp = await searchParams;
  const today = todayIso();
  const month = monthRange(today);
  const unpaidView = sp.show === "unpaid";
  const from = sp.from ?? (unpaidView ? undefined : month.from);
  const to = sp.to ?? (unpaidView ? undefined : month.to);
  const [expenses, categories, vendors, projects] = await Promise.all([
    listExpenses({
      from,
      to,
      category: sp.category,
      vendor: sp.vendor,
      project: sp.project,
      kind: unpaidView ? undefined : sp.kind,
      status: unpaidView ? "unpaid" : sp.status,
      q: sp.q,
    }),
    listCategories(),
    listVendors(),
    loggableProjects(),
  ]);
  const shown = unpaidView ? expenses.filter((e) => e.kind !== "claim" || e.approval === "approved") : expenses;
  const total = shown.reduce((s, e) => s + e.total * e.fx_rate, 0);
  const gst = shown.filter((e) => e.itc_status === "eligible").reduce((s, e) => s + (e.cgst + e.sgst + e.igst), 0);
  const owed = shown.reduce((s, e) => s + (e.approval === "rejected" ? 0 : e.balance), 0);
  const byCat = new Map<string, number>();
  for (const e of shown) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.total * e.fx_rate);
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const drafts = expenses.filter((e) => e.is_draft).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-neutral-500">Bills, receipts and team claims, with GST input credit and TDS.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/expenses/new?kind=bill" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm">
              Add bill
            </Link>
            <Link href="/expenses/new" className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
              Add expense
            </Link>
          </div>
        )}
      </div>
      <ExpenseTabs current={unpaidView ? "/expenses?show=unpaid" : "/expenses"} isAdmin={isAdmin} />

      {drafts > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {drafts} recurring expense{drafts === 1 ? " is" : "s are"} waiting for you to confirm (marked Draft below).
        </p>
      )}

      <form className="flex flex-wrap items-end gap-2 text-sm">
        {unpaidView && <input type="hidden" name="show" value="unpaid" />}
        {!unpaidView && (
          <>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              From
              <input type="date" name="from" defaultValue={from} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              To
              <input type="date" name="to" defaultValue={to} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
            </label>
          </>
        )}
        <select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="vendor" defaultValue={sp.vendor ?? ""} aria-label="Vendor" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select name="project" defaultValue={sp.project ?? ""} aria-label="Project" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Search  /" className="w-40 rounded-lg border border-neutral-300 px-2 py-1.5" />
        <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white">Filter</button>
        <Link href={unpaidView ? "/expenses?show=unpaid" : "/expenses"} className="px-2 py-1.5 text-neutral-500">
          Reset
        </Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={unpaidView ? "Still to pay" : from ? `Spent ${formatInvoiceDate(from)} – ${formatInvoiceDate(to)}` : "Spent"}
          value={formatMoney(unpaidView ? owed : total)}
          sub={`${shown.length} item${shown.length === 1 ? "" : "s"}`}
        />
        <Tile label="GST input credit (claimable)" value={formatMoney(gst)} sub="before GSTR-2B matching" />
        <Tile label="Unpaid" value={formatMoney(owed)} sub="bills and approved claims" />
      </div>

      {cats.length > 0 && !unpaidView && (
        <Card title="By category">
          <ul className="space-y-1.5 text-sm">
            {cats.map(([name, v]) => (
              <li key={name} className="grid grid-cols-[160px_1fr_auto] items-center gap-3">
                <span className="truncate text-neutral-700">{name}</span>
                <span className="h-2 rounded-full bg-neutral-100">
                  <span className="block h-2 rounded-full bg-accent" style={{ width: `${(v / cats[0][1]) * 100}%`, minWidth: 4 }} />
                </span>
                <span className="tabular-nums">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">{unpaidView ? "Nothing to pay. 🎉" : "No expenses in this period."}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">Date</th>
                  <th className="font-medium">Paid to / what</th>
                  <th className="font-medium">Category</th>
                  <th className="font-medium">Project</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-right font-medium">{unpaidView ? "Due" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {shown.map((e) => {
                  const overdue = e.kind === "bill" && e.balance > 0.005 && e.due_date && e.due_date < today;
                  const status = e.is_draft
                    ? "Draft"
                    : e.kind === "claim" && e.approval !== "approved"
                      ? e.approval === "submitted"
                        ? "Waiting approval"
                        : "Sent back"
                      : e.balance <= 0.005
                        ? "Paid"
                        : e.paid > 0
                          ? "Part paid"
                          : "Unpaid";
                  return (
                    <tr key={e.id}>
                      <td className="py-2 whitespace-nowrap text-neutral-600">{formatInvoiceDate(e.expense_date).replace(/, \d{4}$/, "")}</td>
                      <td className="max-w-64 py-2">
                        <Link href={`/expenses/${e.id}`} className="block truncate font-medium hover:text-navy">
                          {e.vendor || e.description || e.category}
                        </Link>
                        <span className="block truncate text-xs text-neutral-500">
                          {KIND[e.kind]}
                          {e.description && e.vendor ? ` · ${e.description}` : ""}
                          {e.receipt_path ? " · 📎" : ""}
                        </span>
                      </td>
                      <td className="text-neutral-600">{e.category}</td>
                      <td className="text-xs text-neutral-500">
                        {e.project_code}
                        {e.billable && <span className="ml-1 rounded bg-blue-50 px-1 text-blue-800">{e.invoiced_document_id ? "billed" : "to bill"}</span>}
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(e.total, e.currency)}</td>
                      <td className={`text-right text-xs whitespace-nowrap ${overdue ? "font-semibold text-red-700" : "text-neutral-600"}`}>
                        {unpaidView
                          ? e.due_date
                            ? `${overdue ? `${daysBetween(e.due_date, today)}d late` : formatInvoiceDate(e.due_date).replace(/, \d{4}$/, "")}`
                            : "—"
                          : status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 border border-line">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
