import Link from "next/link";
import { BarChart } from "@/components/BarChart";
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
import { ageing, kpis, revenueByMonth } from "@/lib/reports";
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
  const revenue = revenueByMonth(docs, today);
  const aged = ageing(docs, today);
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
          <StatLink href="/documents?type=invoice&status=unpaid">
            <Stat label="Owed to you" value={formatMoney(k.outstanding)} />
          </StatLink>
          <StatLink href="/documents?type=invoice&status=overdue">
            <Stat
              label={`Overdue · ${k.overdueCount}`}
              value={formatMoney(k.overdue)}
              tone={k.overdue > 0 ? "danger" : undefined}
            />
          </StatLink>
          <Stat
            label="Revenue this FY"
            value={formatMoney(k.revenueFy)}
            info="Taxable value of invoices issued this financial year, after credit notes."
          />
          <Stat
            label="Collected this FY"
            value={formatMoney(k.collectedFy)}
            sub={k.tdsFy ? `+ ${formatMoney(k.tdsFy)} TDS` : undefined}
          />
          <StatLink href="/documents?type=quote&status=issued">
            <Stat
              label={`Open quotes · ${k.quotesOpenCount}`}
              value={formatMoney(k.quotesOpen)}
              sub={
                k.winRate === null
                  ? undefined
                  : `${Math.round(k.winRate * 100)}% won`
              }
            />
          </StatLink>
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

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
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
        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          <Section
            title="Revenue, last 12 months"
            actions={
              <Link
                href="/reports"
                className="text-sm text-navy hover:underline"
              >
                Reports →
              </Link>
            }
          >
            <div className="pl-10">
              <BarChart
                bars={revenue.map((r) => ({
                  key: r.month,
                  label: r.label,
                  value: r.value,
                  detail: r.month,
                }))}
                title="Revenue"
                height={150}
              />
            </div>
          </Section>
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
