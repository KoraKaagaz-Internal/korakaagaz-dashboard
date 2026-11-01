import dynamic from "next/dynamic";
import Link from "next/link";
import { Files } from "@/components/pm/Files";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { TaskDrawer } from "@/components/pm/TaskDrawer";
import { Card, PageHeader, Section, StatusPill, Tabs, displayStatus } from "@/components/ui";
import { listClients, listDocuments, requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { displayName, progress, projectHealth } from "@/lib/pm";
import { listExpenses } from "@/lib/expense-data";
import { getProjectBundle, projectActivity, teamDirectory } from "@/lib/pm-data";
import { projectTotals } from "@/lib/projects";
import { DOC_LABELS } from "@/lib/types";
import { InvoiceFromExpenses } from "./InvoiceFromExpenses";
import { Overview } from "./Overview";
import { ProjectTime } from "./ProjectTime";
import { StatusSelect } from "./StatusSelect";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";

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
  // freelancers never see money: their tab is just hours
  const tabs = TABS.map((t) => (t.key === "money" && !isStaff ? { ...t, label: "Hours" } : t));
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
          {isStaff && <Billing projectId={p.id} budget={bundle.finance?.budget ?? 0} canEdit={canEdit} />}
          <Section title="Hours">
            <ProjectTime project={p} people={people} />
          </Section>
        </div>
      )}
      {tab === "activity" && <Activity projectId={p.id} people={people} />}

      <TaskDrawer people={people} canWork={canWork} me={email} />
    </div>
  );
}

async function Billing({ projectId, budget, canEdit }: { projectId: string; budget: number; canEdit: boolean }) {
  const [docs, expenses] = await Promise.all([listDocuments({ project: projectId }), listExpenses({ project: projectId }, 500)]);
  const unbilled = expenses.filter((e) => e.billable && !e.invoiced_document_id && (e.kind !== "claim" || e.approval === "approved"));
  const spent = expenses.filter((e) => e.approval !== "rejected").reduce((s, e) => s + e.total * e.fx_rate, 0);
  const t = projectTotals(docs);
  const pct = (n: number) => (budget > 0 ? `${Math.round((n / budget) * 100)}% of budget` : "");
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Quoted", t.quoted],
            ["Billed", t.billed],
            ["Received", t.received],
            ["Outstanding", t.outstanding],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white px-4 py-3 border border-line">
            <div className="text-xs text-neutral-500">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatMoney(value)}</div>
            <div className="text-xs text-neutral-500">{label !== "Outstanding" ? pct(value) : ""}</div>
          </div>
        ))}
      </div>
      <Card
        title="Quotes and invoices"
        actions={
          canEdit ? (
            <span className="flex gap-2">
              <Link href={`/documents/new?type=quote&project=${projectId}`} className="text-sm text-navy hover:underline">
                New quote
              </Link>
              <Link href={`/documents/new?type=invoice&project=${projectId}`} className="text-sm text-navy hover:underline">
                New invoice
              </Link>
            </span>
          ) : undefined
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
        title={`Expenses · ${formatMoney(spent)}`}
        actions={
          canEdit ? (
            <Link href={`/expenses/new?project=${projectId}`} className="text-sm text-navy hover:underline">
              New expense
            </Link>
          ) : undefined
        }
      >
        {expenses.length ? (
          <ul className="divide-y divide-line text-sm">
            {expenses.map((e) => (
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
          <p className="text-sm text-neutral-500">No expenses on this project. Freelancer fees, props and studio hire logged here show up in the project&apos;s margin.</p>
        )}
        {canEdit && unbilled.length > 0 && (
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
