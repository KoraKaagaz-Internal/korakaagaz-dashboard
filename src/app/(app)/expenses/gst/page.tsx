import Link from "next/link";
import { Card, InfoTip, PageHeader, btn } from "@/components/ui";
import { upcoming } from "@/lib/compliance";
import { getSettings, requireMember } from "@/lib/data";
import { listChallans, listExpenses } from "@/lib/expense-data";
import { itcSummary, tdsNature } from "@/lib/expenses";
import { daysBetween, formatInvoiceDate, formatMoney, formatShortDate, todayIso } from "@/lib/money";
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
      <PageHeader
        title="GST & TDS on purchases"
        subtitle="Input credit for GSTR-3B, matching with GSTR-2B, and TDS you deducted from vendors. Rules are FY 2025-26; check with your CA before filing."
        tabs={<ExpenseTabs current="/expenses/gst" />}
        actions={
          <>
            <form className="flex items-center gap-2 text-sm">
              <select name="month" defaultValue={month.slice(0, 7)} aria-label="Month" className="rounded-lg border border-line bg-white px-2 py-1.5">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              <button className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-subtle">Show</button>
            </form>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`GST you can claim back · ${monthLabel(month)}`}>
          <p className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-neutral-500">
            Goes in GSTR-3B, Table 4
            <InfoTip>
              Input tax credit (ITC): GST you paid on business purchases, set off against the GST you collect. The small codes (4A, 4B…) are the rows in the GSTR-3B return.
            </InfoTip>
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-neutral-600">
              All GST on your bills ({itc.count}) <Code>4A</Code>
            </dt>
            <dd className="text-right tabular-nums">{formatMoney(itc.a)}</dd>
            <dt className="text-neutral-600">
              Never claimable (food, cars, personal use) <Code>4B(1)</Code>
            </dt>
            <dd className="text-right tabular-nums">− {formatMoney(itc.b1)}</dd>
            <dt className="text-neutral-600">
              Held back for now: supplier hasn&apos;t filed, or unpaid 180+ days <Code>4B(2)</Code>
            </dt>
            <dd className="text-right tabular-nums">− {formatMoney(itc.b2)}</dd>
            <dt className="font-medium">
              GST to claim this month <Code>4C</Code>
            </dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(itc.c)}</dd>
            {itc.rcmPayable > 0 && (
              <>
                <dt className="pt-2 text-neutral-600">
                  GST you pay yourself on reverse-charge bills <Code>3.1(d)</Code>
                </dt>
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

        <Card title="Check against your suppliers' filings (GSTR-2B)">
          <Reconcile from={from} to={to} />
          {(missing.length > 0 || over180.length > 0) && (
            <ul className="mt-4 space-y-1 text-sm">
              {missing.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <Link href={`/expenses/${e.id}`} className="text-warn hover:underline">
                    {e.vendor} · {e.bill_no || "no bill no."}: {e.gstr2b === "missing" ? "not in 2B yet; ask the supplier to file" : "tax differs from 2B"}
                  </Link>
                </li>
              ))}
              {over180.slice(0, 8).map((e) => (
                <li key={`o-${e.id}`}>
                  <Link href={`/expenses/${e.id}`} className="text-danger hover:underline">
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
              <tbody className="divide-y divide-line">
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
        <ul className="divide-y divide-line text-sm">
          {dues.map((d) => (
            <li key={`${d.date}-${d.title}`} className="flex items-center gap-3 py-1.5">
              <span className={`w-28 ${daysBetween(today, d.date) <= 7 ? "font-semibold text-danger" : "text-neutral-600"}`}>{formatShortDate(d.date)}</span>
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

function Code({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 rounded bg-subtle px-1 font-mono text-[10px] text-neutral-500">{children}</span>;
}
