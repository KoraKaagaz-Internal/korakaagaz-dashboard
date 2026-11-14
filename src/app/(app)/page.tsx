import Link from "next/link";
import { Columns, Frame } from "@/components/charts/Charts";
import { SERIES, inrFull } from "@/lib/format";
import {
  EmptyState,
  PageHeader,
  Section,
  Stat,
  StatRow,
  StatusPill,
  displayStatus,
} from "@/components/ui";
import { upcoming } from "@/lib/compliance";
import { getSettings, listDocuments, requireMember } from "@/lib/data";
import { listExpenses } from "@/lib/expense-data";
import {
  addDays,
  daysBetween,
  financialYear,
  formatDateTime,
  formatMoney,
  formatRelative,
  formatShortDate,
  todayIso,
} from "@/lib/money";
import { SPLIT_CATEGORY, projectFee } from "@/lib/projects";
import { ageing, cashByMonth, inr, kpis, moneyIn } from "@/lib/reports";
import { listEvents, timeApprovalOn } from "@/lib/time-data";
import { DOC_LABELS } from "@/lib/types";

type Attention = {
  key: string;
  href: string;
  tone: "danger" | "warn" | "navy";
  what: string;
  title: string;
  detail: string;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { supabase, isAdmin, canEdit } = await requireMember();
  const { denied } = await searchParams;
  const today = todayIso();
  const fy = financialYear(today);
  const week = addDays(today, 7);
  const [
    docs,
    { data: pays },
    settings,
    events,
    { count: tdsLines },
    { data: followUps },
    bills,
    claims,
    approval,
    { data: tasks },
    { data: outPays },
    { data: projectRows },
  ] = await Promise.all([
    listDocuments(),
    isAdmin
      ? supabase
          .from("payments")
          .select("*, documents(currency, fx_rate)")
          .order("paid_on", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
    getSettings(),
    listEvents(today, week),
    isAdmin
      ? supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .gt("tds_amount", 0)
      : Promise.resolve({ count: 0 }),
    supabase
      .from("leads")
      .select("id, name, company, stage, follow_up_on, service")
      .in("stage", ["enquiry", "discovery", "proposal", "negotiation"])
      .lte("follow_up_on", today)
      .order("follow_up_on")
      .limit(8),
    isAdmin ? listExpenses({ status: "unpaid" }, 300) : Promise.resolve([]),
    isAdmin
      ? listExpenses({ kind: "claim", status: "submitted" }, 50)
      : Promise.resolve([]),
    timeApprovalOn(),
    supabase
      .from("tasks")
      .select("id, title, due_date, project_id, projects(code)")
      .neq("status", "done")
      .gte("due_date", today)
      .lte("due_date", week)
      .order("due_date")
      .limit(8),
    isAdmin ? supabase.from("expense_payments").select("paid_on, amount") : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase.from("projects").select("id, code, name, status, start_date, due_date, project_finance(budget, billing, retainer_amount_month)").neq("status", "cancelled")
      : Promise.resolve({ data: [] }),
  ]);
  const submittedTime =
    isAdmin && approval
      ? ((
          await supabase
            .from("time_entries")
            .select("id", { count: "exact", head: true })
            .eq("status", "submitted")
        ).count ?? 0)
      : 0;
  const dues = !isAdmin
    ? []
    : upcoming(today, 30, {
        gstFiling: settings.gst_filing ?? "monthly",
        stateCode: settings.state_code,
        tds: !!tdsLines,
      });
  const shoots = events.filter(
    (e) => e.status !== "cancelled" && e.type !== "deadline",
  );
  const payments = (pays ?? []).map((p) => ({
    ...p,
    amount: Number(p.amount),
    tds_amount: Number(p.tds_amount),
    currency: p.documents?.currency ?? "INR",
    fx_rate: Number(p.documents?.fx_rate ?? 1),
  }));
  const k = kpis(docs, payments, fy, today);
  const aged = ageing(docs, today);

  // Money: what came in, what went out, what clients and the team are still owed.
  const ins = moneyIn(docs, payments);
  const outs = (outPays ?? []).map((x) => ({ date: x.paid_on as string, amount: Number(x.amount) }));
  const cash = cashByMonth(ins, outs, today);
  const spentFy = outs.filter((x) => financialYear(x.date) === fy).reduce((sum, x) => sum + x.amount, 0);
  const receivedBy = new Map<string, number>();
  for (const x of payments) if (x.project_id) receivedBy.set(x.project_id, (receivedBy.get(x.project_id) ?? 0) + inr(x, x.amount + x.tds_amount));
  const pendingProjects = (projectRows ?? [])
    .map((r) => {
      const fin = Array.isArray(r.project_finance) ? r.project_finance[0] : r.project_finance;
      const fee = projectFee(fin ? { budget: Number(fin.budget), billing: fin.billing, retainer_amount_month: Number(fin.retainer_amount_month) } : null, r, today);
      return { id: r.id as string, code: r.code as string, name: r.name as string, status: r.status as string, pending: Math.max(0, fee - (receivedBy.get(r.id) ?? 0)) };
    })
    .filter((x) => x.pending > 0.5)
    .sort((a, b) => b.pending - a.pending);
  // invoices without a project aren't in any project's fee, so add their balances once
  const looseInvoices = docs.filter((d) => d.doc_type === "invoice" && d.status === "issued" && !d.project_id).reduce((sum, d) => sum + inr(d, d.balance?.balance ?? 0), 0);
  const pendingTotal = pendingProjects.reduce((sum, x) => sum + x.pending, 0) + looseInvoices;
  const teamDue = bills.filter((e) => e.category === SPLIT_CATEGORY).reduce((sum, e) => sum + e.balance, 0);
  const drafts = docs.filter((d) => d.status === "draft").slice(0, 6);

  // One list of things someone has to act on, most urgent first.
  const attention: Attention[] = [
    ...(isAdmin
      ? docs
          .filter((d) => d.status === "awaiting_approval")
          .map((d): Attention => ({
            key: d.id,
            href: `/documents/${d.id}`,
            tone: "warn",
            what: "Approve",
            title: `${DOC_LABELS[d.doc_type].short} for ${d.client.name}`,
            detail: formatMoney(d.total, d.currency),
          }))
      : []),
    ...docs
      .filter(
        (d) =>
          d.doc_type === "invoice" &&
          d.status === "issued" &&
          d.balance?.overdue,
      )
      .map((d): Attention => ({
        key: d.id,
        href: `/documents/${d.id}`,
        tone: "danger",
        what: `${daysBetween(d.due_date ?? d.issue_date, today)}d overdue`,
        title: `${d.number} · ${d.client.name}`,
        detail: formatMoney(d.balance?.balance ?? d.total, d.currency),
      })),
    ...pendingProjects
      .filter((x) => x.status === "done" || x.status === "review")
      .map((x): Attention => ({
        key: `pending-${x.id}`,
        href: `/projects/${x.id}?tab=money`,
        tone: x.status === "done" ? "danger" : "warn",
        what: "Payment pending",
        title: `${x.code} · ${x.name}`,
        detail: formatMoney(x.pending),
      })),
    ...(followUps ?? []).map((l): Attention => ({
      key: l.id,
      href: `/crm/${l.id}`,
      tone: l.follow_up_on < today ? "danger" : "warn",
      what:
        l.follow_up_on < today
          ? `Follow up · ${daysBetween(l.follow_up_on, today)}d late`
          : "Follow up today",
      title: l.company || l.name,
      detail: l.service,
    })),
    ...bills
      .filter(
        (e) =>
          !e.is_draft && e.kind !== "claim" && e.due_date && e.due_date <= week,
      )
      .map((e): Attention => ({
        key: e.id,
        href: `/expenses/${e.id}`,
        tone: e.due_date! < today ? "danger" : "warn",
        what:
          e.due_date! < today
            ? "Bill overdue"
            : `Bill due ${formatRelative(e.due_date, today)}`,
        title: e.vendor || e.description,
        detail: formatMoney(e.balance),
      })),
    ...claims.map((e): Attention => ({
      key: e.id,
      href: `/expenses/${e.id}`,
      tone: "warn",
      what: "Claim to approve",
      title: e.description || e.category,
      detail: formatMoney(e.total, e.currency),
    })),
    ...(submittedTime
      ? [
          {
            key: "time",
            href: "/time?tab=approve",
            tone: "warn" as const,
            what: "Timesheets",
            title: `${submittedTime} time entr${submittedTime === 1 ? "y" : "ies"} to approve`,
            detail: "",
          },
        ]
      : []),
    ...dues
      .filter((d) => daysBetween(today, d.date) <= 7)
      .map((d): Attention => ({
        key: `${d.date}${d.title}`,
        href: "/expenses/gst",
        tone: "navy",
        what: `Filing ${formatRelative(d.date, today)}`,
        title: d.title,
        detail: d.detail,
      })),
  ];

  return (
    <div className="space-y-8">
      {denied && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          That page is for the admin only.
        </p>
      )}
      <PageHeader
        title="Home"
        subtitle={
          isAdmin
            ? `Financial year 20${fy.replace("-", "–")} · amounts in INR`
            : `This week · ${formatShortDate(today)} to ${formatShortDate(week)}`
        }
      />

      {isAdmin ? (
        <StatRow>
          <StatLink href="/reports?basis=cash">
            <Stat label="Received this FY" value={formatMoney(k.collectedFy)} sub={k.tdsFy ? `+ ${formatMoney(k.tdsFy)} TDS` : undefined} info="Money that reached you this financial year: payments on projects and invoices, and advances." />
          </StatLink>
          <StatLink href="#pending">
            <Stat
              label="Pending from clients"
              value={formatMoney(pendingTotal)}
              tone={pendingTotal > 0 ? "warn" : undefined}
              sub={k.overdue > 0 ? `${formatMoney(k.overdue)} overdue` : `${pendingProjects.length} project${pendingProjects.length === 1 ? "" : "s"}`}
              info="Project fees not yet received, plus unpaid invoices that aren't on a project."
            />
          </StatLink>
          <StatLink href="/expenses?status=unpaid">
            <Stat label="To pay team" value={formatMoney(teamDue)} tone={teamDue > 0 ? "warn" : undefined} info="Team splits on projects that haven't been marked paid yet." />
          </StatLink>
          <StatLink href="/expenses">
            <Stat label="Spent this FY" value={formatMoney(spentFy)} info="Everything paid out this financial year: team payouts, bills, salaries and claims." />
          </StatLink>
          <Stat label="Net this FY" value={formatMoney(k.collectedFy - spentFy)} tone={k.collectedFy - spentFy < 0 ? "danger" : "ok"} info="Received minus spent, this financial year." />
        </StatRow>
      ) : (
        <StatRow>
          <StatLink href="/documents?type=quote&status=issued">
            <Stat
              label="Open quotes"
              value={String(k.quotesOpenCount)}
              sub={
                k.winRate === null
                  ? undefined
                  : `${Math.round(k.winRate * 100)}% won`
              }
            />
          </StatLink>
          <StatLink href="/crm">
            <Stat
              label="Follow-ups due"
              value={String((followUps ?? []).length)}
              tone={
                (followUps ?? []).some((l) => l.follow_up_on < today)
                  ? "danger"
                  : undefined
              }
            />
          </StatLink>
          <Stat
            label="Tasks due this week"
            value={String((tasks ?? []).length)}
          />
          <StatLink href="/calendar?view=week">
            <Stat label="Shoots & meetings" value={String(shoots.length)} />
          </StatLink>
        </StatRow>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          title={
            attention.length
              ? `Needs attention · ${attention.length}`
              : "Needs attention"
          }
        >
          {attention.length ? (
            <ul className="divide-y divide-line">
              {attention.slice(0, 12).map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 py-2.5 text-sm hover:text-navy"
                  >
                    <span
                      className={`w-36 shrink-0 text-xs font-medium ${a.tone === "danger" ? "text-danger" : a.tone === "warn" ? "text-warn" : "text-navy"}`}
                    >
                      {a.tone === "danger" ? "● " : ""}
                      {a.what}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                      {a.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="All clear"
              hint={
                isAdmin
                  ? "Nothing overdue, no follow-ups due and no bills this week."
                  : "No lead follow-ups due."
              }
            />
          )}
        </Section>

        <Section
          title="This week"
          actions={
            <Link
              href="/calendar?view=week"
              className="text-sm text-navy hover:underline"
            >
              Calendar
            </Link>
          }
        >
          {shoots.length || (tasks ?? []).length ? (
            <ul className="divide-y divide-line text-sm">
              {shoots.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/calendar/${e.id}`}
                    className="flex items-center gap-3 py-2.5 hover:text-navy"
                  >
                    <span className="w-28 shrink-0 text-xs text-neutral-500">
                      {e.all_day
                        ? formatShortDate(e.starts_at.slice(0, 10))
                        : formatDateTime(e.starts_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="text-xs text-neutral-500 capitalize">
                      {e.type}
                    </span>
                  </Link>
                </li>
              ))}
              {(tasks ?? []).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/projects/${t.project_id}?tab=list&task=${t.id}`}
                    className="flex items-center gap-3 py-2.5 hover:text-navy"
                  >
                    <span className="w-28 shrink-0 text-xs text-neutral-500">
                      Due {formatRelative(t.due_date, today)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="font-mono text-xs text-neutral-400">
                      {(t.projects as { code?: string } | null)?.code}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-neutral-500">
              No shoots, meetings or task deadlines in the next 7 days.
            </p>
          )}
        </Section>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Frame
            title="Money in vs money out"
            subtitle="Last 12 months, by the date money moved"
            legend={[
              { label: "In", color: SERIES[2] },
              { label: "Out", color: SERIES[1] },
            ]}
            table={{ columns: ["Month", "In", "Out", "Net"], rows: cash.map((c) => [c.label, inrFull(c.in), inrFull(c.out), inrFull(c.in - c.out)]) }}
          >
            <Columns
              data={cash}
              series={[
                { key: "in", label: "In", color: SERIES[2] },
                { key: "out", label: "Out", color: SERIES[1] },
              ]}
              height={170}
            />
          </Frame>
          <div id="pending" className="space-y-8">
            <Section title="Pending from clients">
              {pendingProjects.length ? (
                <ul className="divide-y divide-line text-sm">
                  {pendingProjects.slice(0, 8).map((x) => (
                    <li key={x.id}>
                      <Link href={`/projects/${x.id}?tab=money`} className="flex items-center gap-3 py-2 hover:text-navy">
                        <span className="font-mono text-xs text-neutral-400">{x.code}</span>
                        <span className="min-w-0 flex-1 truncate">{x.name}</span>
                        <span className="tabular-nums">{formatMoney(x.pending)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-neutral-500">Every project fee has been received.</p>
              )}
            </Section>
            {aged.some((a) => a.value > 0) && (
              <Section title="Owed to you, by age">
                <ul className="space-y-2.5">
                  {aged.map((a) => {
                    const max = Math.max(1, ...aged.map((x) => x.value));
                    return (
                      <li
                        key={a.bucket}
                        className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm"
                        title={`${a.count} invoice(s)`}
                      >
                        <span className="text-neutral-600">{a.bucket}</span>
                        <span className="h-2 rounded-full bg-subtle">
                          <span
                            className="block h-2 rounded-full bg-accent"
                            style={{
                              width: `${(a.value / max) * 100}%`,
                              minWidth: a.value ? 4 : 0,
                            }}
                          />
                        </span>
                        <span className="text-right tabular-nums">
                          {formatMoney(a.value)}{" "}
                          <span className="text-xs text-neutral-400">
                            · {a.count}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}

      {canEdit && drafts.length > 0 && (
        <Section
          title={`Drafts · ${drafts.length}`}
          actions={
            <Link
              href="/documents?status=draft"
              className="text-sm text-navy hover:underline"
            >
              All drafts
            </Link>
          }
        >
          <ul className="divide-y divide-line text-sm">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="flex items-center gap-3 py-2.5 hover:text-navy"
                >
                  <span className="w-24 shrink-0 text-xs text-neutral-500">
                    {DOC_LABELS[d.doc_type].short}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {d.client.name || "No client yet"}
                  </span>
                  <span className="w-24 text-right tabular-nums">
                    {formatMoney(d.total, d.currency)}
                  </span>
                  <StatusPill status={displayStatus(d)} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function StatLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="-m-2 rounded-lg p-2 hover:bg-subtle">
      {children}
    </Link>
  );
}
