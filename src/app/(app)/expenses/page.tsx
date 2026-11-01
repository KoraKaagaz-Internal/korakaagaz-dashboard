import { Badge, ButtonLink, DataList, EmptyState, FilterBar, Input, PageHeader, Section, Select, Stat } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { listCategories, listExpenses, listVendors } from "@/lib/expense-data";
import { daysBetween, formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { monthRange } from "@/lib/time";
import { loggableProjects } from "@/lib/time-data";
import { ExpenseTabs } from "./Tabs";

const KIND = { receipt: "Paid", bill: "Bill", claim: "Claim" } as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { canEdit } = await requireMember();
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

  const active = ["category", "vendor", "project", "q"].filter((k) => sp[k]).length + (sp.from || sp.to ? 1 : 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        subtitle="Bills, receipts and team claims, with GST input credit and TDS."
        actions={
          canEdit && (
            <>
              <ButtonLink href="/expenses/new?kind=bill" size="sm">
                New bill
              </ButtonLink>
              <ButtonLink href="/expenses/new" variant="primary" size="sm">
                New expense
              </ButtonLink>
            </>
          )
        }
        tabs={<ExpenseTabs current={unpaidView ? "/expenses?show=unpaid" : "/expenses"} />}
      />

      {drafts > 0 && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          {drafts} recurring expense{drafts === 1 ? " is" : "s are"} waiting for you to confirm (marked Draft below).
        </p>
      )}

      <FilterBar
        action="/expenses"
        active={active}
        clearHref={unpaidView ? "/expenses?show=unpaid" : "/expenses"}
        search={
          <>
            {unpaidView && <input type="hidden" name="show" value="unpaid" />}
            <Input name="q" type="search" defaultValue={sp.q} aria-label="Search expenses" placeholder="Search vendor, bill no., description" className="!h-8 !py-1" />
          </>
        }
      >
        {!unpaidView && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              From
              <Input type="date" name="from" aria-label="From date" defaultValue={from} className="!h-8 !w-auto !py-1" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              To
              <Input type="date" name="to" aria-label="To date" defaultValue={to} className="!h-8 !w-auto !py-1" />
            </label>
          </>
        )}
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className="!h-8 !w-auto !py-1">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="vendor" defaultValue={sp.vendor ?? ""} aria-label="Vendor" className="!h-8 !w-auto !py-1">
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project" className="!h-8 !w-auto !py-1">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-3">
        <Stat
          label={unpaidView ? "Still to pay" : from ? `Spent ${formatShortDate(from)} – ${formatShortDate(to)}` : "Spent"}
          value={formatMoney(unpaidView ? owed : total)}
          sub={`${shown.length} item${shown.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="GST you can claim back"
          value={formatMoney(gst)}
          info="Input tax credit: GST on eligible business purchases that you can set off against the GST you collect. Final once it matches GSTR-2B."
        />
        <Stat label="Unpaid" value={formatMoney(owed)} sub="bills and approved claims" />
      </div>

      {cats.length > 0 && !unpaidView && (
        <Section title="By category">
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
        </Section>
      )}

      <div>
        {shown.length === 0 ? (
          <EmptyState title={unpaidView ? "Nothing to pay" : active ? "No expenses match these filters" : "No expenses in this period"} filtered={active > 0} />
        ) : (
          <DataList
            label="Expenses"
            columns={[
              { key: "what", label: "Paid to / what", primary: true },
              { key: "date", label: "Date" },
              { key: "category", label: "Category" },
              { key: "project", label: "Project", hideOnMobile: true },
              { key: "total", label: "Total", align: "right" },
              { key: "status", label: unpaidView ? "Due" : "Status", align: "right" },
            ]}
            rows={shown.map((e) => {
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
              return {
                id: e.id,
                href: `/expenses/${e.id}`,
                cells: {
                  what: (
                    <span className="block max-w-72">
                      <span className="block truncate">{e.vendor || e.description || e.category}</span>
                      <span className="block truncate text-xs font-normal text-neutral-500">
                        {KIND[e.kind]}
                        {e.description && e.vendor ? ` · ${e.description}` : ""}
                        {e.receipt_path ? " · receipt" : ""}
                      </span>
                    </span>
                  ),
                  date: <span className="whitespace-nowrap text-neutral-600">{formatShortDate(e.expense_date)}</span>,
                  category: <span className="text-neutral-600">{e.category}</span>,
                  project: (
                    <span className="text-xs text-neutral-500">
                      {e.project_code}
                      {e.billable && <Badge className="ml-1">{e.invoiced_document_id ? "billed" : "to bill"}</Badge>}
                    </span>
                  ),
                  total: formatMoney(e.total, e.currency),
                  status: (
                    <span className={`text-xs whitespace-nowrap ${overdue ? "font-semibold text-danger" : "text-neutral-600"}`}>
                      {unpaidView ? (e.due_date ? (overdue ? `${daysBetween(e.due_date, today)}d late` : formatShortDate(e.due_date)) : "—") : status}
                    </span>
                  ),
                },
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
