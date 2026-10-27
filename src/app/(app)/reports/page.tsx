import { Card, btn } from "@/components/ui";
import { getSettings, listDocuments, requireMember } from "@/lib/data";
import { GSTR1_SECTIONS, gstr1Section } from "@/lib/gstr1";
import { formatMoney, todayIso } from "@/lib/money";
import { ageing } from "@/lib/reports";

function monthRange(iso: string, back: number) {
  const [y, m] = iso.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 - back, 1));
  const end = new Date(Date.UTC(y, m - back, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: start.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireMember();
  const today = todayIso();
  const last = monthRange(today, 1);
  const sp = await searchParams;
  const from = sp.from ?? last.from;
  const to = sp.to ?? last.to;
  const [periodDocs, allDocs, settings] = await Promise.all([listDocuments({ from, to }), listDocuments(), getSettings()]);
  const qs = `from=${from}&to=${to}`;
  const invoices = periodDocs.filter((d) => d.doc_type === "invoice" && d.status !== "draft" && d.status !== "cancelled" && d.status !== "awaiting_approval");
  const inr = (n: number, d: { currency: string; fx_rate: number }) => (d.currency === "INR" ? n : n * d.fx_rate);
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") => invoices.reduce((s, d) => s + inr(d[k], d), 0);
  const counts = Object.fromEntries(Object.keys(GSTR1_SECTIONS).map((s) => [s, s.startsWith("hsn") ? null : gstr1Section(s as keyof typeof GSTR1_SECTIONS, periodDocs, settings.state_code).length]));
  const aged = ageing(allDocs, today);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            From
            <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" name="from" defaultValue={from} />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input className="rounded-lg border border-neutral-300 px-3 py-2" type="date" name="to" defaultValue={to} />
          </label>
          <button className={btn.primary}>Apply</button>
          {[1, 0].map((b) => {
            const r = monthRange(today, b);
            return (
              <a key={b} className={btn.ghost} href={`/reports?from=${r.from}&to=${r.to}`}>
                {r.label}
              </a>
            );
          })}
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Sales summary for the period (INR)">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-neutral-500">Invoices</dt>
            <dd className="text-right">{invoices.length}</dd>
            <dt className="text-neutral-500">Taxable value</dt>
            <dd className="text-right tabular-nums">{formatMoney(sum("taxable"))}</dd>
            <dt className="text-neutral-500">CGST</dt>
            <dd className="text-right tabular-nums">{formatMoney(sum("cgst"))}</dd>
            <dt className="text-neutral-500">SGST</dt>
            <dd className="text-right tabular-nums">{formatMoney(sum("sgst"))}</dd>
            <dt className="text-neutral-500">IGST</dt>
            <dd className="text-right tabular-nums">{formatMoney(sum("igst"))}</dd>
            <dt className="font-medium">Invoice value</dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(sum("total"))}</dd>
          </dl>
        </Card>
        <Card title="Receivables ageing (today)">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {aged.map((a) => (
                <tr key={a.bucket}>
                  <td className="py-1.5 text-neutral-600">{a.bucket}</td>
                  <td className="text-right text-neutral-500">{a.count}</td>
                  <td className="text-right tabular-nums">{formatMoney(a.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="GSTR-1 preparation (CSV, GST offline-tool columns)">
        <p className="mb-3 text-sm text-neutral-500">For your CA or the GST offline tool. Check the figures before filing; this helps you prepare, it doesn&apos;t file anything.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(GSTR1_SECTIONS).map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <span>
                {label}
                {counts[key] !== null && <span className="ml-1 text-neutral-400">· {counts[key]} rows</span>}
              </span>
              <a className={btn.ghost} href={`/api/export/gstr1?section=${key}&${qs}`}>
                CSV
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Other exports">
        <div className="flex flex-wrap gap-2">
          <a className={btn.secondary} href={`/api/export/documents?${qs}`}>
            All documents
          </a>
          <a className={btn.secondary} href={`/api/export/payments?${qs}`}>
            Payments received
          </a>
          <a className={btn.secondary} href={`/api/export/tds?${qs}`}>
            TDS receivable (match with Form 26AS)
          </a>
        </div>
      </Card>
    </div>
  );
}
