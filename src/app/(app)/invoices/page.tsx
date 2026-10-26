import Link from "next/link";
import { listInvoices, type InvoiceFilters } from "@/lib/data";
import { formatAmount, formatInvoiceDate } from "@/lib/money";
import { Card, Input, Select, STATUS_STYLES, btn } from "@/components/ui";
import { InvoiceRowActions } from "./InvoiceRowActions";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<InvoiceFilters> }) {
  const filters = await searchParams;
  const invoices = await listInvoices(filters);

  // Totals are per currency so INR and USD invoices never get added together.
  const sums = new Map<string, { paid: number; outstanding: number }>();
  for (const inv of invoices) {
    const s = sums.get(inv.currency) ?? { paid: 0, outstanding: 0 };
    if (inv.status === "paid") s.paid += inv.total;
    else s.outstanding += inv.total;
    sums.set(inv.currency, s);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <div className="flex flex-wrap gap-3">
          {[...sums].map(([cur, s]) => (
            <div key={cur} className="flex gap-3">
              <Stat label={`Outstanding (${cur})`} value={formatAmount(s.outstanding, cur)} tone="text-amber-700" />
              <Stat label={`Paid (${cur})`} value={formatAmount(s.paid, cur)} tone="text-green-700" />
            </div>
          ))}
        </div>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_140px_150px_150px_auto]">
          <Input name="q" placeholder="Search client or invoice no." defaultValue={filters.q} />
          <Select name="status" defaultValue={filters.status ?? ""}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </Select>
          <Input type="date" name="from" aria-label="From date" defaultValue={filters.from} />
          <Input type="date" name="to" aria-label="To date" defaultValue={filters.to} />
          <div className="flex gap-2">
            <button className={btn.primary}>Filter</button>
            <Link href="/invoices" className={btn.secondary}>
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {invoices.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500">
            No invoices found.{" "}
            <Link href="/invoices/new" className="text-navy underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
                <tr>
                  <th className="py-2 font-medium">Number</th>
                  <th className="font-medium">Client</th>
                  <th className="font-medium">Date</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="pl-4 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 font-mono text-xs">
                      <Link href={`/invoices/${inv.id}/edit`} className="hover:text-navy hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td>{inv.client.name}</td>
                    <td className="text-neutral-600">{formatInvoiceDate(inv.issue_date)}</td>
                    <td className="text-right tabular-nums">
                      {inv.currency} {formatAmount(inv.total, inv.currency)}
                    </td>
                    <td className="pl-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_STYLES[inv.status]}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <InvoiceRowActions id={inv.id} number={inv.number} status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-black/5">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
