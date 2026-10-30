import Link from "next/link";
import { Files } from "@/components/pm/Files";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { TaskDrawer } from "@/components/pm/TaskDrawer";
import { Card, StatusPill, displayStatus } from "@/components/ui";
import { listClients, listDocuments, requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { displayName, progress, projectHealth } from "@/lib/pm";
import { getProjectBundle, projectActivity, teamDirectory } from "@/lib/pm-data";
import { projectTotals } from "@/lib/projects";
import { DOC_LABELS } from "@/lib/types";
import { Board } from "./Board";
import { Overview } from "./Overview";
import { ProjectTime } from "./ProjectTime";
import { StatusSelect } from "./StatusSelect";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";

const TABS = [
  { key: "board", label: "Board" },
  { key: "list", label: "List" },
  { key: "timeline", label: "Timeline" },
  { key: "overview", label: "Overview" },
  { key: "files", label: "Files" },
  { key: "time", label: "Time" },
  { key: "billing", label: "Billing", staff: true },
  { key: "activity", label: "Activity" },
];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { canEdit, canWork, isStaff, isAdmin, email } = await requireTeam();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tabs = TABS.filter((t) => !t.staff || isStaff);
  const tab = tabs.some((t) => t.key === rawTab) ? rawTab! : "board";
  const [bundle, people] = await Promise.all([getProjectBundle(id), teamDirectory()]);
  const { project: p } = bundle;
  const today = todayIso();
  const prog = progress(bundle.tasks);
  const health = projectHealth(p, bundle.tasks, today);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/projects" className="text-sm text-neutral-500 hover:text-navy">
            ← Projects
          </Link>
          <h1 className="text-2xl font-semibold">
            <span className="mr-2 font-mono text-base font-normal text-neutral-400">{p.code}</span>
            {p.name}
          </h1>
          <p className="text-sm text-neutral-500">
            {p.client_id && isStaff ? (
              <Link href={`/clients/${p.client_id}`} className="hover:text-navy">
                {bundle.client_name}
              </Link>
            ) : (
              bundle.client_name || "Internal project"
            )}
            {p.owner_email ? ` · led by ${displayName(p.owner_email, people)}` : ""}
            {p.due_date ? ` · due ${formatInvoiceDate(p.due_date)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthPill health={health} />
          <StatusSelect id={p.id} status={p.status} disabled={!canEdit} />
        </div>
      </div>
      <div className="max-w-md">
        <ProgressBar pct={prog.pct} label={`${prog.done} of ${prog.total} tasks done`} />
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-4" aria-label="Project sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${p.id}?tab=${t.key}`}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-navy font-medium text-navy" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

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
      {tab === "time" && (
        <ProjectTime
          project={p}
          finance={bundle.finance}
          people={people}
          isAdmin={isAdmin}
          canEdit={canEdit}
          billed={isAdmin ? projectTotals(await listDocuments({ project: p.id })).billed : null}
        />
      )}
      {tab === "billing" && isStaff && <Billing projectId={p.id} budget={bundle.finance?.budget ?? 0} canEdit={canEdit} />}
      {tab === "activity" && <Activity projectId={p.id} people={people} />}

      <TaskDrawer people={people} canWork={canWork} me={email} />
    </div>
  );
}

async function Billing({ projectId, budget, canEdit }: { projectId: string; budget: number; canEdit: boolean }) {
  const docs = await listDocuments({ project: projectId });
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
          <div key={label} className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
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
    const entity = { tasks: "task", task_comments: "comment", files: "file", deliverables: "deliverable", projects: "project", project_finance: "budget", documents: "document", phases: "phase" }[e.entity] ?? e.entity;
    if (e.action.startsWith("status_")) return `moved ${entity} to ${e.action.slice(7).replace("_", " ")}`;
    const keys = e.action === "update" ? Object.keys(d).filter((k) => k !== "id").join(", ") : "";
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
              <span className="w-36 shrink-0 text-xs text-neutral-500">{new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span>
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
