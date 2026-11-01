import { ButtonLink, DataList, EmptyState, FilterBar, Input, PageHeader, Select, StatusPill, Tabs, displayStatus } from "@/components/ui";
import { listClients, listDocuments, requireMember, type DocumentFilters } from "@/lib/data";
import { formatMoney, formatShortDate } from "@/lib/money";
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

  const active = ["status", "client", "from", "to"].filter((k) => filters[k as keyof DocumentFilters]).length;
  const filtered = active > 0 || !!filters.q;

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Invoices, quotes, proformas, receipts and credit notes"
        actions={
          <>
            <ButtonLink href={`/api/export/documents${exportQs ? `?${exportQs}` : ""}`} prefetch={false} size="sm">
              Export CSV
            </ButtonLink>
            {canEdit && (
              <ButtonLink href={`/documents/new?type=${type || "invoice"}`} variant="primary" size="sm">
                New {DOC_LABELS[type || "invoice"].short.toLowerCase()}
              </ButtonLink>
            )}
          </>
        }
        tabs={
          <Tabs
            label="Document types"
            items={[["", "All"], ...DOC_TYPES.map((t) => [t, DOC_LABELS[t].plural])].map(([t, label]) => ({
              href: `/documents${qs({ type: t, status: "" })}`,
              label,
              active: type === t,
            }))}
          />
        }
      />

      <FilterBar
        action="/documents"
        active={active}
        clearHref={`/documents${type ? `?type=${type}` : ""}`}
        search={
          <>
            {type && <input type="hidden" name="type" value={type} />}
            <Input
              name="q"
              type="search"
              aria-label="Search number or client"
              placeholder="Search number or client"
              defaultValue={filters.q}
              autoFocus={!!filters.focus}
              className="!h-8 !py-1"
            />
          </>
        }
      >
        <Select name="status" aria-label="Status" defaultValue={filters.status ?? ""} className="!h-8 !w-auto !py-1">
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select name="client" aria-label="Client" defaultValue={filters.client ?? ""} className="!h-8 !w-auto !py-1">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          From
          <Input type="date" name="from" aria-label="From date" defaultValue={filters.from} className="!h-8 !w-auto !py-1" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          To
          <Input type="date" name="to" aria-label="To date" defaultValue={filters.to} className="!h-8 !w-auto !py-1" />
        </label>
      </FilterBar>

      {docs.length === 0 ? (
        filtered ? (
          <EmptyState
            title="Nothing matches these filters"
            filtered
            action={
              <ButtonLink href={`/documents${type ? `?type=${type}` : ""}`} size="sm">
                Clear filters
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            title={`No ${type ? DOC_LABELS[type].plural.toLowerCase() : "documents"} yet`}
            hint="Create one and it shows up here."
            action={
              canEdit ? (
                <ButtonLink href={`/documents/new?type=${type || "invoice"}`} variant="primary" size="sm">
                  New {DOC_LABELS[type || "invoice"].short.toLowerCase()}
                </ButtonLink>
              ) : undefined
            }
          />
        )
      ) : (
        <DataList
          label="Documents"
          columns={[
            { key: "client", label: "Client", primary: true },
            { key: "number", label: "Number" },
            { key: "type", label: "Type", hideOnMobile: !!type },
            { key: "date", label: "Date" },
            { key: "due", label: "Due / valid", hideOnMobile: true },
            { key: "total", label: "Total", align: "right" },
            { key: "balance", label: "Balance", align: "right", hideOnMobile: true },
            { key: "status", label: "Status" },
          ]}
          rows={docs.map((d) => ({
            id: d.id,
            href: `/documents/${d.id}`,
            cells: {
              client: d.client.name || "No client yet",
              number: <span className="font-mono text-xs">{d.number ?? "Draft"}</span>,
              type: <span className="text-neutral-600">{DOC_LABELS[d.doc_type].short}</span>,
              date: <span className="text-neutral-600">{formatShortDate(d.issue_date)}</span>,
              due: <span className="text-neutral-600">{formatShortDate(d.doc_type === "quote" ? d.valid_until : d.due_date)}</span>,
              total: formatMoney(d.total, d.currency),
              balance: d.balance?.payment_status ? formatMoney(d.balance.balance, d.currency) : "—",
              status: <StatusPill status={displayStatus(d)} />,
            },
          }))}
        />
      )}
    </div>
  );
}
