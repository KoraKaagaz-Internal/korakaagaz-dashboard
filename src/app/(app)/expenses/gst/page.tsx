import Link from "next/link";
import { Card, btn } from "@/components/ui";
import { upcoming } from "@/lib/compliance";
import { getSettings, requireMember } from "@/lib/data";
import { listChallans, listExpenses } from "@/lib/expense-data";
import { itcSummary, tdsNature } from "@/lib/expenses";
import { daysBetween, formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { monthRange } from "@/lib/time";
import { ExpenseTabs } from "../Tabs";
import { Challan } from "./Challan";
import { Reconcile } from "./Reconcile";

const monthLabel = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function GstPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { isAdmin } = await requireMember();
  const sp = await searchParams;
  const today = todayIso();
  // default: last month (that's what gets filed this month)
  const prev = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? `${sp.month}-01` : prev;
  const { from, to } = monthRange(month);
  const [settings, expenses, challans] = await Promise.all([
    getSettings(),
    listExpenses({ from: monthRange(`${Number(month.slice(0, 4)) - 1}${month.slice(4)}`).from }, 3000),
    listChallans(),
  ]);
  const withAge = expenses.map((e) => ({ ...e, unpaid_days: e.balance > 0.005 ? daysBetween(e.expense_date, today) : 0 }));
  const itc = itcSummary(withAge, month);
  const inMonth = expenses.filter((e) => e.expense_date >= from && e.expense_date <= to);
  const tdsLines = inMonth.filter((e) => e.tds_amount > 0);
  const tdsDue = tdsLines.filter((e) => !e.tds_challan_id);
  const tdsDueAmount = tdsDue.reduce((s, e) => s + e.tds_amount, 0);
  const missing = withAge.filter((e) => e.gstr2b === "missing" || e.gstr2b === "mismatch");
  const over180 = withAge.filter((e) => e.unpaid_days > 180 && e.cgst + e.sgst + e.igst > 0 && e.itc_status === "eligible");
  const dues = upcoming(today, 60, { gstFiling: settings.gst_filing ?? "monthly", stateCode: settings.state_code, tds: expenses.some((e) => e.tds_amount > 0) });
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1)).toISOString().slice(0, 7));
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">GST &amp; TDS on purchases</h1>
          <p className="text-sm text-neutral-500">
            Input credit for GSTR-3B, matching with GSTR-2B, and TDS you deducted from vendors. Rules are FY 2025-26; check with your CA before filing.
          </p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <select name="month" defaultValue={month.slice(0, 7)} aria-label="Month" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white">Show</button>
        </form>
      </div>
      <ExpenseTabs current="/expenses/gst" isAdmin={isAdmin} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Input credit · ${monthLabel(month)} (GSTR-3B Table 4)`}>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-neutral-600">4A · All credit on bills ({itc.count})</dt>
            <dd className="text-right tabular-nums">{formatMoney(itc.a)}</dd>
            <dt className="text-neutral-600">4B(1) · Blocked under s.17(5)</dt>
            <dd className="text-right tabular-nums">− {formatMoney(itc.b1)}</dd>
            <dt className="text-neutral-600">4B(2) · Held back (not in 2B / unpaid 180+ days)</dt>
            <dd className="text-right tabular-nums">− {formatMoney(itc.b2)}</dd>
            <dt className="font-medium">4C · Net credit to claim</dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(itc.c)}</dd>
            {itc.rcmPayable > 0 && (
              <>
                <dt className="pt-2 text-neutral-600">Reverse-charge GST to pay in cash (Table 3.1(d))</dt>
                <dd className="pt-2 text-right tabular-nums">{formatMoney(itc.rcmPayable)}</dd>
              </>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={btn.secondary} href={`/api/export/purchases?${qs}`}>
              Purchase register CSV
            </a>
            <a className={btn.ghost} href={`/api/export/purchases?from=${monthRange(`${Number(today.slice(0, 4)) - 1}-04-01`).from}&to=${to}`}>
              Whole year
            </a>
          </div>
        </Card>

        <Card title="Match with GSTR-2B">
          <Reconcile from={from} to={to} />
          {(missing.length > 0 || over180.length > 0) && (
            <ul className="mt-4 space-y-1 text-sm">
              {missing.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <Link href={`/expenses/${e.id}`} className="text-amber-800 hover:underline">
                    {e.vendor} · {e.bill_no || "no bill no."}: {e.gstr2b === "missing" ? "not in 2B yet; ask the supplier to file" : "tax differs from 2B"}
                  </Link>
                </li>
              ))}
              {over180.slice(0, 8).map((e) => (
                <li key={`o-${e.id}`}>
                  <Link href={`/expenses/${e.id}`} className="text-red-700 hover:underline">
                    {e.vendor}: unpaid {e.unpaid_days} days; reverse the credit until you pay
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`TDS deducted · ${monthLabel(month)}`}>
        {tdsLines.length ? (
          <>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Vendor</th>
                  <th className="font-medium">Nature</th>
                  <th className="text-right font-medium">Taxable</th>
                  <th className="text-right font-medium">TDS</th>
                  <th className="text-right font-medium">Deposited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tdsLines.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5">
                      <Link href={`/expenses/${e.id}`} className="hover:text-navy">
                        {e.vendor}
                      </Link>
                    </td>
                    <td className="text-neutral-600">{tdsNature(e.tds_nature).label}</td>
                    <td className="text-right tabular-nums">{formatMoney(e.taxable)}</td>
                    <td className="text-right tabular-nums">{formatMoney(e.tds_amount)}</td>
                    <td className="text-right text-xs">{e.tds_challan_id ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm">
              To deposit: <b>{formatMoney(tdsDueAmount)}</b> by{" "}
              {formatInvoiceDate(
                month.slice(5, 7) === "03" ? `${month.slice(0, 4)}-04-30` : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 7)).toISOString().slice(0, 10),
              )}{" "}
              (challan ITNS-281 on the income-tax portal).
            </p>
            {isAdmin && <Challan month={month} amount={Math.round(tdsDueAmount * 100) / 100} ids={tdsDue.map((e) => e.id)} today={today} />}
            <a className={`${btn.ghost} mt-3 inline-block`} href={`/api/export/tds-payable?${qs}`}>
              TDS deducted CSV (26Q working)
            </a>
          </>
        ) : (
          <p className="text-sm text-neutral-500">No TDS deducted on purchases this month.</p>
        )}
        {challans.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-600">Deposits made ({challans.length})</summary>
            <ul className="mt-1 space-y-0.5 text-neutral-600">
              {challans.map((c) => (
                <li key={c.id}>
                  {monthLabel(c.month)}: {formatMoney(c.amount)} on {formatInvoiceDate(c.paid_on)}
                  {c.challan_no ? ` · CIN ${c.challan_no}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Coming up (next 60 days)">
        <ul className="divide-y divide-neutral-100 text-sm">
          {dues.map((d) => (
            <li key={`${d.date}-${d.title}`} className="flex items-center gap-3 py-1.5">
              <span className={`w-28 ${daysBetween(today, d.date) <= 7 ? "font-semibold text-red-700" : "text-neutral-600"}`}>
                {formatInvoiceDate(d.date).replace(/, \d{4}$/, "")}
              </span>
              <span className="flex-1">{d.title}</span>
              <span className="text-xs text-neutral-500">{d.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          Filing as a {settings.gst_filing === "qrmp" ? "quarterly (QRMP)" : settings.gst_filing === "none" ? "non-GST" : "monthly"} GST filer. Change it in Settings. Dates move
          when the government extends them.
        </p>
      </Card>
    </div>
  );
}
