import dynamic from "next/dynamic";
import Link from "next/link";
import { Files } from "@/components/pm/Files";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { TaskDrawer } from "@/components/pm/TaskDrawer";
import { Card, PageHeader, Section, StatusPill, Tabs, displayStatus } from "@/components/ui";
import { listClients, listDocuments, requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { displayName, progress, projectHealth, type Person } from "@/lib/pm";
import { listExpenses } from "@/lib/expense-data";
import { getProjectBundle, projectActivity, teamDirectory } from "@/lib/pm-data";
import { SPLIT_CATEGORY, projectFee, projectMoney } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { PaymentsCard, SplitCard } from "./ProjectMoney";
import { DOC_LABELS } from "@/lib/types";
import { InvoiceFromExpenses } from "./InvoiceFromExpenses";
import { Overview } from "./Overview";
import { ProjectTime } from "./ProjectTime";
import { StatusSelect } from "./StatusSelect";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import { AgreementList } from "@/components/agreements/AgreementList";

// drag-and-drop code only loads with the board tab
const Board = dynamic(() => import("./Board").then((m) => m.Board));

const TABS = [
  { key: "board", label: "Board" },
  { key: "list", label: "List" },
  { key: "timeline", label: "Timeline" },
  { key: "overview", label: "Overview" },
  { key: "files", label: "Files" },
  { key: "money", label: "Money" },
  { key: "activity", label: "Activity" },
];
// old links
const ALIASES: Record<string, string> = { time: "money", billing: "money", hours: "money" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { canEdit, canWork, isStaff, isAdmin, email } = await requireTeam();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  // only the admin sees project money: everyone else's tab is hours (plus agreements for staff)
  const tabs = TABS.map((t) => (t.key === "money" && !isAdmin ? { ...t, label: "Hours" } : t));
  const want = ALIASES[rawTab ?? ""] ?? rawTab;
  const tab = tabs.some((t) => t.key === want) ? want! : "board";
  const [bundle, people] = await Promise.all([getProjectBundle(id), teamDirectory()]);
  const { project: p } = bundle;
  const today = todayIso();
  const prog = progress(bundle.tasks);
  const health = projectHealth(p, bundle.tasks, today);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        title={
          <>
            <span className="mr-2 font-mono text-base font-normal text-neutral-400">{p.code}</span>
            {p.name}
          </>
        }
        subtitle={
          <>
            {p.client_id && isStaff ? (
              <Link href={`/clients/${p.client_id}`} className="hover:text-navy">
                {bundle.client_name}
              </Link>
            ) : (
              bundle.client_name || "Internal project"
            )}
            {p.owner_email ? ` · led by ${displayName(p.owner_email, people)}` : ""}
            {p.due_date ? ` · due ${formatShortDate(p.due_date)}` : ""}
          </>
        }
        meta={
          <span className="w-full max-w-md">
            <ProgressBar pct={prog.pct} label={`${prog.done} of ${prog.total} tasks done`} />
          </span>
        }
        actions={
          <>
            <HealthPill health={health} />
            <StatusSelect id={p.id} status={p.status} disabled={!canEdit} />
          </>
        }
        tabs={<Tabs label="Project sections" items={tabs.map((t) => ({ href: `/projects/${p.id}?tab=${t.key}`, label: t.label, active: tab === t.key }))} />}
      />

      {tab === "board" && <Board projectId={p.id} tasks={bundle.tasks} phases={bundle.phases} people={people} canWork={canWork} />}
      {tab === "list" && <TaskList projectId={p.id} tasks={bundle.tasks} phases={bundle.phases} people={people} canWork={canWork} />}
      {tab === "timeline" && <Timeline tasks={bundle.tasks} phases={bundle.phases} today={today} projectId={p.id} />}
      {tab === "overview" && (
        <Overview
          bundle={bundle}
          people={people}
          clients={isStaff && canEdit ? (await listClients()).map((c) => ({ id: c.id, name: c.name })) : null}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      )}
      {tab === "files" && (
        <Card title="Files">
          <Files projectId={p.id} files={bundle.files} canWork={canWork} />
        </Card>
      )}
      {tab === "money" && (
        <div className="space-y-8">
          {isAdmin && <Billing projectId={p.id} fee={projectFee(bundle.finance, p, today)} people={people} today={today} />}
          {isStaff && <AgreementList filter={{ project: p.id }} newHref={`/agreements/new?project=${p.id}`} canEdit={canEdit} />}
          <Section title="Hours">
            <ProjectTime project={p} people={people} byPerson={isAdmin} />
          </Section>
        </div>
      )}
      {tab === "activity" && <Activity projectId={p.id} people={people} />}

      <TaskDrawer people={people} canWork={canWork} me={email} />
    </div>
  );
}

async function Billing({ projectId, fee, people, today }: { projectId: string; fee: number; people: Person[]; today: string }) {
  const supabase = await createClient();
  const [docs, expenses, { data: pays }] = await Promise.all([
    listDocuments({ project: projectId }),
    listExpenses({ project: projectId }, 500),
    supabase.from("payments").select("id, paid_on, amount, tds_amount, mode, note, document_id, documents(number, currency, fx_rate)").eq("project_id", projectId).order("paid_on", { ascending: false }),
  ]);
  const payments = ((pays ?? []) as unknown as {
    id: string;
    paid_on: string;
    amount: number;
    tds_amount: number;
    mode: string;
    note: string;
    document_id: string | null;
    documents: { number: string; currency: string; fx_rate: number } | null;
  }[]).map((x) => {
    const fx = x.documents && x.documents.currency !== "INR" ? Number(x.documents.fx_rate) || 1 : 1;
    return { ...x, amount: Number(x.amount) * fx, tds_amount: Number(x.tds_amount) * fx };
  });
  const live = expenses.filter((e) => e.approval !== "rejected" && !e.is_draft);
  const isSplit = (e: (typeof expenses)[number]) => e.category === SPLIT_CATEGORY;
  const m = projectMoney(
    fee,
    payments,
    live.map((e) => ({ split: isSplit(e), cost: e.total * e.fx_rate, paid: e.paid, balance: e.balance })),
  );
  const others = expenses.filter((e) => !isSplit(e));
  const unbilled = others.filter((e) => e.billable && !e.invoiced_document_id && (e.kind !== "claim" || e.approval === "approved"));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            ["Fee", m.fee, ""],
            ["Received", m.received, fee > 0 ? `${Math.round((m.received / fee) * 100)}% of the fee` : ""],
            ["Pending from client", m.pending, ""],
            ["Team split", m.split, m.split ? `${formatMoney(m.splitPaid)} paid · ${formatMoney(m.splitDue)} to pay` : ""],
            ["Your share", m.share, m.other ? `after ${formatMoney(m.other)} other costs` : "fee − split − costs"],
          ] as const
        ).map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-line bg-white px-4 py-3">
            <div className="text-xs text-neutral-500">{label}</div>
            <div className={`text-lg font-semibold tabular-nums ${label === "Pending from client" && value > 0 ? "text-warn" : label === "Your share" && value < 0 ? "text-danger" : ""}`}>{formatMoney(value)}</div>
            <div className="text-xs text-neutral-500">{sub}</div>
          </div>
        ))}
      </div>
      {fee === 0 && (
        <p className="text-sm text-neutral-500">
          No fee set yet. Add it on the <Link href={`/projects/${projectId}?tab=overview`} className="text-navy hover:underline" prefetch={false}>Overview</Link> tab to see what&apos;s pending.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <PaymentsCard
          projectId={projectId}
          today={today}
          pendingAmount={m.pending}
          rows={payments.map((x) => ({ id: x.id, paid_on: x.paid_on, amount: x.amount + x.tds_amount, mode: x.mode, note: x.note, invoice: x.document_id ? { id: x.document_id, number: x.documents?.number ?? "" } : null }))}
        />
        <SplitCard
          projectId={projectId}
          fee={fee}
          people={people}
          today={today}
          rows={live.filter(isSplit).map((e) => ({ id: e.id, name: e.vendor, amount: e.total * e.fx_rate, paid: e.paid, balance: e.balance }))}
        />
      </div>
      <Card
        title="Quotes and invoices"
        actions={
          (
            <span className="flex gap-2">
              <Link href={`/documents/new?type=quote&project=${projectId}`} className="text-sm text-navy hover:underline">
                New quote
              </Link>
              <Link href={`/documents/new?type=invoice&project=${projectId}`} className="text-sm text-navy hover:underline">
                New invoice
              </Link>
            </span>
          )
        }
      >
        {docs.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing billed yet. New quotes and invoices from here are tagged to this project.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
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
        )}
      </Card>
      <Card
        title={`Other costs · ${formatMoney(m.other)}`}
        actions={
          (
            <Link href={`/expenses/new?project=${projectId}`} className="text-sm text-navy hover:underline">
              New expense
            </Link>
          )
        }
      >
        {others.length ? (
          <ul className="divide-y divide-line text-sm">
            {others.map((e) => (
              <li key={e.id}>
                <Link href={`/expenses/${e.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                  <span className="w-24 text-neutral-500">{formatShortDate(e.expense_date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.vendor || e.description} <span className="text-neutral-500">· {e.category}</span>
                  </span>
                  {e.billable && <span className="text-xs text-navy">{e.invoiced_document_id ? "billed" : "to bill"}</span>}
                  <span className="tabular-nums">{formatMoney(e.total, e.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No other costs. Props, studio hire, printing and travel logged here come out of your share.</p>
        )}
        {unbilled.length > 0 && (
          <div className="mt-3">
            <InvoiceFromExpenses projectId={projectId} count={unbilled.length} />
          </div>
        )}
      </Card>
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  insert: "added",
  delete: "removed",
  update: "changed",
};

async function Activity({ projectId, people }: { projectId: string; people: { email: string; name: string }[] }) {
  const events = await projectActivity(projectId);
  const what = (e: (typeof events)[number]) => {
    const d = e.diff as Record<string, unknown>;
    const raw = d.title ?? d.name ?? d.body;
    const title = String((Array.isArray(raw) ? raw[1] : raw) ?? "").slice(0, 80);
    const entity =
      {
        tasks: "task",
        task_comments: "comment",
        files: "file",
        deliverables: "deliverable",
        projects: "project",
        project_finance: "budget",
        documents: "document",
        phases: "phase",
      }[e.entity] ?? e.entity;
    if (e.action.startsWith("status_")) return `moved ${entity} to ${e.action.slice(7).replace("_", " ")}`;
    const keys =
      e.action === "update"
        ? Object.keys(d)
            .filter((k) => k !== "id")
            .join(", ")
        : "";
    return `${ACTION_TEXT[e.action] ?? e.action} ${entity}${title ? ` “${title}”` : ""}${keys ? ` (${keys.replace(/_/g, " ")})` : ""}`;
  };
  return (
    <Card title="Activity">
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-36 shrink-0 text-xs text-neutral-500">
                {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
              </span>
              <span>
                <span className="font-medium">{e.actor_email ? displayName(e.actor_email, people) : "System"}</span> {what(e)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
