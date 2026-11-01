import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusPill, btn, displayStatus } from "@/components/ui";
import { getClient, listDocuments, listProjects, requireMember } from "@/lib/data";
import { stateLabel } from "@/lib/gst";
import { buildLedger } from "@/lib/ledger";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { DOC_LABELS } from "@/lib/types";
import { StatementButton } from "./StatementButton";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { supabase, canEdit } = await requireMember();
  const { id } = await params;
  const range = await searchParams;
  const client = await getClient(id);
  if (!client) notFound();
  const [docs, projects, { data: pays }] = await Promise.all([
    listDocuments({ client: id }),
    listProjects(id),
    supabase.from("payments").select("*, documents!inner(client_id, number, currency)").eq("documents.client_id", id),
  ]);
  const ledger = buildLedger(docs, pays ?? [], range.from, range.to);
  const outstanding = docs.filter((d) => d.doc_type === "invoice" && d.status === "issued").reduce((s, d) => s + (d.balance?.balance ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/clients" className="text-sm text-neutral-500 hover:text-navy">
            ← Clients
          </Link>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-neutral-500">
            {[client.address, client.city, client.country !== "India" ? client.country : stateLabel(client.state_code), client.gstin && `GSTIN ${client.gstin}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={btn.secondary} href={`/api/export/ledger?client=${id}${range.from ? `&from=${range.from}` : ""}${range.to ? `&to=${range.to}` : ""}`}>
            Statement CSV
          </a>
          {canEdit && <StatementButton clientId={id} disabled={outstanding <= 0} />}
          {canEdit && (
            <Link className={btn.primary} href={`/documents/new?type=invoice&client=${id}`}>
              New invoice
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatMoney(outstanding)} />
        <Stat label="Invoiced (all time)" value={formatMoney(docs.filter((d) => d.doc_type === "invoice" && d.status === "issued").reduce((s, d) => s + d.total, 0))} />
        <Stat label="Documents" value={String(docs.length)} />
      </div>

      {projects.length > 0 && (
        <Card title="Projects">
          <ul className="flex flex-wrap gap-2 text-sm">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="rounded-full bg-neutral-100 px-3 py-1 hover:bg-navy/10">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Statement of account">
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
          <label>
            From <input className="rounded-md border border-neutral-300 px-2 py-1" type="date" name="from" defaultValue={range.from} />
          </label>
          <label>
            To <input className="rounded-md border border-neutral-300 px-2 py-1" type="date" name="to" defaultValue={range.to} />
          </label>
          <button className={btn.secondary}>Apply</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="py-2 font-medium">Date</th>
                <th className="font-medium">Particulars</th>
                <th className="text-right font-medium">Debit</th>
                <th className="text-right font-medium">Credit</th>
                <th className="text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {ledger.opening !== 0 && (
                <tr>
                  <td className="py-2 text-neutral-600">{formatInvoiceDate(range.from)}</td>
                  <td>Opening balance</td>
                  <td />
                  <td />
                  <td className="text-right tabular-nums">{formatMoney(ledger.opening)}</td>
                </tr>
              )}
              {ledger.rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 text-neutral-600">{formatInvoiceDate(r.date)}</td>
                  <td>
                    {r.docId ? (
                      <Link className="hover:text-navy" href={`/documents/${r.docId}`}>
                        {r.particulars}
                      </Link>
                    ) : (
                      r.particulars
                    )}
                  </td>
                  <td className="text-right tabular-nums">{r.debit ? formatMoney(r.debit) : ""}</td>
                  <td className="text-right tabular-nums">{r.credit ? formatMoney(r.credit) : ""}</td>
                  <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ledger.rows.length === 0 && <p className="py-4 text-sm text-neutral-500">No entries in this period.</p>}
          <p className="mt-2 text-xs text-neutral-500">In INR. Foreign-currency documents use the exchange rate on the invoice.</p>
        </div>
      </Card>

      <Card title="All documents">
        <ul className="divide-y divide-neutral-100 text-sm">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/documents/${d.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                <span className="w-28 font-mono text-xs">{d.number ?? "Draft"}</span>
                <span className="w-24 text-neutral-500">{DOC_LABELS[d.doc_type].short}</span>
                <span className="flex-1 text-neutral-600">{formatInvoiceDate(d.issue_date)}</span>
                <span className="tabular-nums">{formatMoney(d.total, d.currency)}</span>
                <StatusPill status={displayStatus(d)} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 border border-line">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
