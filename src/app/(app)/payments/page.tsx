import Link from "next/link";
import { DataList, EmptyState, FilterBar, Input, PageHeader, Section, Select, Stat, StatRow, Tabs } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { loadPayTargets, listPaymentLines } from "@/lib/payment-data";
import { PAY_MODES, modeLabel, summarise } from "@/lib/payments";
import { RecordPayment } from "./RecordPayment";

export const metadata = { title: "Payments" };

type SP = { tab?: string; for?: string; from?: string; to?: string; mode?: string; q?: string };

/** Money in, in one place: record a payment, see what's pending, and every payment so far. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireMember("admin");
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "record";
  const today = todayIso();
  const lines = await listPaymentLines();
  const targets = await loadPayTargets(lines);
  const s = summarise(lines, today);
  const pending = targets.filter((t) => t.pending > 0.5);
  const pendingTotal = pending.reduce((sum, t) => sum + t.pending, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Everything clients have paid you, and what they still owe. Amounts in INR."
        tabs={
          <Tabs
            label="Payments sections"
            items={[
              { href: "/payments", label: "Record & pending", active: tab === "record" },
              { href: "/payments?tab=history", label: `History · ${lines.length}`, active: tab === "history" },
            ]}
          />
        }
      />

      <StatRow>
        <Stat label="Today" value={formatMoney(s.today)} />
        <Stat label="This month" value={formatMoney(s.month)} />
        <Stat label="This FY" value={formatMoney(s.fy)} sub={s.tds ? `+ ${formatMoney(s.tds)} TDS` : undefined} info="Money received since 1 April: payments on projects and invoices. Advance adjustments aren't counted again." />
        <Stat label="Pending" value={formatMoney(pendingTotal)} tone={pendingTotal > 0 ? "warn" : undefined} sub={`${pending.length} to collect`} info="Project fees not yet received, plus balances on invoices that aren't on a project." />
        <Stat label="By method (FY)" value={s.byMode[0] ? modeLabel(s.byMode[0].mode) : "—"} sub={s.byMode.slice(0, 3).map((m) => `${modeLabel(m.mode)} ${formatMoney(m.amount)}`).join(" · ") || undefined} />
      </StatRow>

      {tab === "record" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <RecordPayment key={sp.for ?? ""} targets={targets} today={today} initial={sp.for} />
          <Section title={`Pending · ${formatMoney(pendingTotal)}`}>
            {pending.length ? (
              <ul className="divide-y divide-line text-sm">
                {pending.map((t) => (
                  <li key={t.key} className="flex items-center gap-3 py-2.5">
                    <Link href={t.kind === "project" ? `/projects/${t.id}?tab=money` : `/documents/${t.id}`} className="min-w-0 flex-1 truncate hover:text-navy">
                      {t.label}
                      {t.client && <span className="text-neutral-500"> · {t.client}</span>}
                    </Link>
                    <span className="tabular-nums">{formatMoney(t.pending)}</span>
                    <Link href={`/payments?for=${encodeURIComponent(t.key)}`} prefetch={false} className="text-xs text-navy hover:underline">
                      Record
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing pending" hint="Every project fee and invoice has been paid." />
            )}
          </Section>
        </div>
      ) : (
        <History lines={lines} sp={sp} />
      )}
    </div>
  );
}

function History({ lines, sp }: { lines: Awaited<ReturnType<typeof listPaymentLines>>; sp: SP }) {
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = lines.filter(
    (l) =>
      (!sp.from || l.paid_on >= sp.from) &&
      (!sp.to || l.paid_on <= sp.to) &&
      (!sp.mode || l.mode === sp.mode) &&
      (!q || `${l.client} ${l.project?.code ?? ""} ${l.project?.name ?? ""} ${l.invoice?.number ?? ""} ${l.reference} ${l.note}`.toLowerCase().includes(q)),
  );
  const total = shown.reduce((s, l) => s + l.amount, 0);
  const active = [sp.from, sp.to, sp.mode, sp.q].filter(Boolean).length;
  return (
    <Section title={`${shown.length} payment${shown.length === 1 ? "" : "s"} · ${formatMoney(total)}`}>
      <FilterBar
        action="/payments"
        active={active}
        clearHref="/payments?tab=history"
        search={<Input name="q" type="search" defaultValue={sp.q} placeholder="Search client, project, invoice, UTR" aria-label="Search payments" />}
      >
        <input type="hidden" name="tab" value="history" />
        <Input name="from" type="date" defaultValue={sp.from} aria-label="From" className="!w-auto" />
        <Input name="to" type="date" defaultValue={sp.to} aria-label="To" className="!w-auto" />
        <Select name="mode" defaultValue={sp.mode ?? ""} aria-label="Method" className="!w-auto">
          <option value="">Any method</option>
          {[...PAY_MODES, ["advance", "Advance adjusted"] as const].map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </FilterBar>
      {shown.length ? (
        <DataList
          label="Payments"
          columns={[
            { key: "date", label: "Date" },
            { key: "who", label: "For", primary: true },
            { key: "mode", label: "Method", hideOnMobile: true },
            { key: "ref", label: "Reference", hideOnMobile: true },
            { key: "amount", label: "Amount", align: "right" },
          ]}
          rows={shown.map((l) => ({
            id: l.id,
            href: `/payments/${l.id}`,
            cells: {
              date: formatShortDate(l.paid_on),
              who: (
                <>
                  {l.client || "No client"}
                  <span className="font-normal text-neutral-500">
                    {l.project ? ` · ${l.project.code}` : ""}
                    {l.invoice ? ` · ${l.invoice.number}` : ""}
                    {l.file_name ? " · 📎" : ""}
                  </span>
                </>
              ),
              mode: modeLabel(l.mode),
              ref: l.reference || "—",
              amount: (
                <>
                  {formatMoney(l.amount)}
                  {l.tds ? <span className="block text-xs text-neutral-500">+ {formatMoney(l.tds)} TDS</span> : null}
                </>
              ),
            },
          }))}
        />
      ) : (
        <EmptyState title={lines.length ? "No payments match" : "No payments yet"} filtered={!!lines.length} hint={lines.length ? undefined : "Record the first one from the Record tab."} />
      )}
    </Section>
  );
}
