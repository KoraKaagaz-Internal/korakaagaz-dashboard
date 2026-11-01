import Link from "next/link";
import { BarChart } from "@/components/BarChart";
import { Card, StatusPill, displayStatus } from "@/components/ui";
import { upcoming } from "@/lib/compliance";
import { getSettings, listDocuments, requireMember } from "@/lib/data";
import { addDays, daysBetween } from "@/lib/money";
import { listEvents } from "@/lib/time-data";
import { financialYear, formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { ageing, kpis, revenueByMonth } from "@/lib/reports";
import { DOC_LABELS } from "@/lib/types";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase, isAdmin, canEdit } = await requireMember();
  const { denied } = await searchParams;
  const today = todayIso();
  const fy = financialYear(today);
  const [docs, { data: pays }, settings, events, { count: tdsLines }, { data: followUps }] = await Promise.all([
    listDocuments(),
    supabase.from("payments").select("*, documents(currency, fx_rate)").order("paid_on", { ascending: false }).limit(1000),
    getSettings(),
    listEvents(today, addDays(today, 7)),
    supabase.from("expenses").select("id", { count: "exact", head: true }).gt("tds_amount", 0),
    supabase
      .from("leads")
      .select("id, name, company, stage, follow_up_on, service")
      .in("stage", ["enquiry", "discovery", "proposal", "negotiation"])
      .lte("follow_up_on", today)
      .order("follow_up_on")
      .limit(8),
  ]);
  const dues = upcoming(today, 30, { gstFiling: settings.gst_filing ?? "monthly", stateCode: settings.state_code, tds: !!tdsLines });
  const shoots = events.filter((e) => e.status !== "cancelled" && e.type !== "deadline");
  const payments = (pays ?? []).map((p) => ({
    ...p,
    amount: Number(p.amount),
    tds_amount: Number(p.tds_amount),
    currency: p.documents?.currency ?? "INR",
    fx_rate: Number(p.documents?.fx_rate ?? 1),
  }));
  const k = kpis(docs, payments, fy, today);
  const revenue = revenueByMonth(docs, today);
  const aged = ageing(docs, today);
  const needsApproval = docs.filter((d) => d.status === "awaiting_approval");
  const overdue = docs.filter((d) => d.doc_type === "invoice" && d.status === "issued" && d.balance?.overdue).slice(0, 6);
  const drafts = docs.filter((d) => d.status === "draft").slice(0, 6);

  return (
    <div className="space-y-6">
      {denied && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">That page is for the admin only.</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-500">Financial year 20{fy.replace("-", "–")} · amounts in INR</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/documents/new?type=quote" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium">
              New quote
            </Link>
            <Link href="/documents/new?type=invoice" className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
              New invoice
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Outstanding" value={formatMoney(k.outstanding)} href="/documents?type=invoice&status=unpaid" />
        <Tile label={`Overdue · ${k.overdueCount}`} value={formatMoney(k.overdue)} tone={k.overdue > 0 ? "text-red-700" : ""} href="/documents?type=invoice&status=overdue" />
        <Tile label="Revenue this FY" value={formatMoney(k.revenueFy)} sub="taxable value, after credit notes" />
        <Tile label="Collected this FY" value={formatMoney(k.collectedFy)} sub={k.tdsFy ? `+ ${formatMoney(k.tdsFy)} TDS deducted` : undefined} />
        <Tile
          label={`Open quotes · ${k.quotesOpenCount}`}
          value={formatMoney(k.quotesOpen)}
          sub={k.winRate === null ? "no decided quotes yet" : `${Math.round(k.winRate * 100)}% win rate`}
          href="/documents?type=quote&status=issued"
        />
      </div>

      {needsApproval.length > 0 && isAdmin && (
        <Card title={`Waiting for your approval · ${needsApproval.length}`}>
          <DocList docs={needsApproval} />
        </Card>
      )}

      <p className="text-sm">
        <Link href="/reports" className="text-navy hover:underline">
          Full reports: profit, cash forecast, clients, team →
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Revenue by month (last 12 months)">
          <div className="pl-10">
            <BarChart bars={revenue.map((r) => ({ key: r.month, label: r.label, value: r.value, detail: r.month }))} title="Revenue by month" />
          </div>
        </Card>
        <Card title="Receivables by age">
          <ul className="space-y-2.5">
            {aged.map((a) => {
              const max = Math.max(1, ...aged.map((x) => x.value));
              return (
                <li key={a.bucket} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm" title={`${a.count} invoice(s)`}>
                  <span className="text-neutral-600">{a.bucket}</span>
                  <span className="h-2 rounded-full bg-neutral-100">
                    <span className="block h-2 rounded-full" style={{ width: `${(a.value / max) * 100}%`, background: "var(--color-accent)", minWidth: a.value ? 4 : 0 }} />
                  </span>
                  <span className="text-right tabular-nums">
                    {formatMoney(a.value)} <span className="text-xs text-neutral-400">· {a.count}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {(followUps ?? []).length > 0 && (
        <Card
          title={`Leads to follow up · ${followUps!.length}`}
          actions={
            <Link href="/crm" className="text-sm text-navy hover:underline">
              Leads
            </Link>
          }
        >
          <ul className="divide-y divide-neutral-100 text-sm">
            {followUps!.map((l) => (
              <li key={l.id}>
                <Link href={`/crm/${l.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                  <span className={`w-24 text-xs ${l.follow_up_on < today ? "font-semibold text-red-700" : "text-neutral-500"}`}>
                    {l.follow_up_on < today ? `${daysBetween(l.follow_up_on, today)}d overdue` : "Today"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.company || l.name}</span>
                  <span className="text-xs text-neutral-500">{l.service}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="This week's shoots and meetings"
          actions={
            <Link href="/calendar?view=week" className="text-sm text-navy hover:underline">
              Calendar
            </Link>
          }
        >
          {shoots.length ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {shoots.map((e) => (
                <li key={e.id}>
                  <Link href={`/calendar/${e.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                    <span className="w-24 text-xs text-neutral-500">
                      {new Date(e.starts_at).toLocaleString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        hour: e.all_day ? undefined : "numeric",
                        minute: e.all_day ? undefined : "2-digit",
                        timeZone: "Asia/Kolkata",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="text-xs text-neutral-500">{e.project_code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nothing booked in the next 7 days." />
          )}
        </Card>
        <Card
          title="Filing due in the next 30 days"
          actions={
            <Link href="/expenses/gst" className="text-sm text-navy hover:underline">
              GST &amp; TDS
            </Link>
          }
        >
          <ul className="divide-y divide-neutral-100 text-sm">
            {dues.map((d) => (
              <li key={`${d.date}${d.title}`} className="flex items-center gap-3 py-2">
                <span className={`w-24 text-xs ${daysBetween(today, d.date) <= 5 ? "font-semibold text-red-700" : "text-neutral-500"}`}>
                  {formatInvoiceDate(d.date).replace(/, \d{4}$/, "")}
                </span>
                <span className="flex-1">{d.title}</span>
                <span className="text-xs text-neutral-500">{d.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Overdue invoices">{overdue.length ? <DocList docs={overdue} /> : <Empty text="Nothing overdue." />}</Card>
        <Card title="Drafts">{drafts.length ? <DocList docs={drafts} /> : <Empty text="No drafts." />}</Card>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = "", href }: { label: string; value: string; sub?: string; tone?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </>
  );
  const cls = "block rounded-xl bg-white px-4 py-3 border border-line";
  return href ? (
    <Link href={href} className={`${cls} hover:ring-navy/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function DocList({ docs }: { docs: Awaited<ReturnType<typeof listDocuments>> }) {
  return (
    <ul className="divide-y divide-neutral-100 text-sm">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={`/documents/${d.id}`} className="flex items-center gap-3 py-2.5 hover:text-navy">
            <span className="w-28 shrink-0 font-mono text-xs">{d.number ?? DOC_LABELS[d.doc_type].short}</span>
            <span className="min-w-0 flex-1 truncate">{d.client.name}</span>
            <span className="text-xs text-neutral-500">{formatInvoiceDate(d.due_date ?? d.issue_date)}</span>
            <span className="w-24 text-right tabular-nums">{formatMoney(d.balance?.balance ?? d.total, d.currency)}</span>
            <StatusPill status={displayStatus(d)} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-neutral-500">{text}</p>;
}
