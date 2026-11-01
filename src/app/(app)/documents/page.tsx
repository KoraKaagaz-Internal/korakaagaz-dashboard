import Link from "next/link";
import { Card, Input, Select, StatusPill, btn, displayStatus } from "@/components/ui";
import { listClients, listDocuments, requireMember, type DocumentFilters } from "@/lib/data";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { DOC_LABELS, DOC_TYPES, type DocType } from "@/lib/types";

const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["draft", "Draft"],
  ["awaiting_approval", "Needs approval"],
  ["issued", "Issued"],
  ["unpaid", "Unpaid"],
  ["partial", "Part paid"],
  ["paid", "Paid"],
  ["overdue", "Overdue"],
  ["accepted", "Accepted (quotes)"],
  ["declined", "Declined (quotes)"],
  ["expired", "Expired (quotes)"],
  ["cancelled", "Cancelled"],
];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<DocumentFilters & { focus?: string }> }) {
  const { canEdit } = await requireMember();
  const filters = await searchParams;
  const type = DOC_TYPES.includes(filters.type as DocType) ? (filters.type as DocType) : "";
  const [docs, clients] = await Promise.all([listDocuments({ ...filters, type }), listClients()]);
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...filters, ...patch }).filter(([k, v]) => v && k !== "focus") as [string, string][]);
    return p.toString() ? `?${p}` : "";
  };
  const exportQs = new URLSearchParams(Object.entries({ ...filters, type }).filter(([k, v]) => v && k !== "focus") as [string, string][]).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/export/documents${exportQs ? `?${exportQs}` : ""}`} className={btn.secondary}>
            Export CSV
          </a>
          {canEdit && (
            <Link href={`/documents/new?type=${type || "invoice"}`} className={btn.primary}>
              New {DOC_LABELS[type || "invoice"].short.toLowerCase()}
            </Link>
          )}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 text-sm">
        {[["", "All"], ...DOC_TYPES.map((t) => [t, DOC_LABELS[t].plural])].map(([t, label]) => (
          <Link
            key={t}
            href={`/documents${qs({ type: t, status: "" })}`}
            className={`rounded-full px-3 py-1 ${type === t ? "bg-navy text-white" : "bg-white text-neutral-700 ring-1 ring-black/5 hover:bg-neutral-50"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_180px_140px_140px_auto]">
          {type && <input type="hidden" name="type" value={type} />}
          <Input name="q" placeholder="Search number or client  ( / )" defaultValue={filters.q} autoFocus={!!filters.focus} />
          <Select name="status" defaultValue={filters.status ?? ""}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="client" defaultValue={filters.client ?? ""}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input type="date" name="from" aria-label="From date" defaultValue={filters.from} />
          <Input type="date" name="to" aria-label="To date" defaultValue={filters.to} />
          <div className="flex gap-2">
            <button className={btn.primary}>Filter</button>
            <Link href={`/documents${type ? `?type=${type}` : ""}`} className={btn.secondary}>
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {docs.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500">Nothing here yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
                <tr>
                  <th className="py-2 font-medium">Number</th>
                  <th className="font-medium">Type</th>
                  <th className="font-medium">Client</th>
                  <th className="font-medium">Date</th>
                  <th className="font-medium">Due / valid</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-right font-medium">Balance</th>
                  <th className="pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50">
                    <td className="py-2.5 font-mono text-xs">
                      <Link href={`/documents/${d.id}`} className="hover:text-navy hover:underline">
                        {d.number ?? "Draft"}
                      </Link>
                    </td>
                    <td className="text-neutral-600">{DOC_LABELS[d.doc_type].short}</td>
                    <td>
                      <Link href={`/documents/${d.id}`}>{d.client.name}</Link>
                    </td>
                    <td className="text-neutral-600">{formatInvoiceDate(d.issue_date)}</td>
                    <td className="text-neutral-600">{formatInvoiceDate(d.doc_type === "quote" ? d.valid_until : d.due_date)}</td>
                    <td className="text-right tabular-nums">{formatMoney(d.total, d.currency)}</td>
                    <td className="text-right tabular-nums">{d.balance?.payment_status ? formatMoney(d.balance.balance, d.currency) : "—"}</td>
                    <td className="pl-4">
                      <StatusPill status={displayStatus(d)} />
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
