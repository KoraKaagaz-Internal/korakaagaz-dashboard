import Link from "next/link";
import { PriorityFlag, TaskStatusPill } from "@/components/pm/Pills";
import { TaskDrawer } from "@/components/pm/TaskDrawer";
import { requireTeam } from "@/lib/data";
import { formatInvoiceDate, todayIso } from "@/lib/money";
import { BUCKET_LABEL, dueBucket, displayName, type Bucket } from "@/lib/pm";
import { listMyTasks, teamDirectory } from "@/lib/pm-data";
import { DoneBox } from "./DoneBox";
import { PageHeader } from "@/components/ui";

const ORDER: Bucket[] = ["overdue", "today", "week", "later", "no_date"];

export default async function MyWorkPage() {
  const { email, canWork } = await requireTeam();
  const [tasks, people] = await Promise.all([listMyTasks(), teamDirectory()]);
  const today = todayIso();
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const groups = ORDER.map((b) => ({ bucket: b, tasks: open.filter((t) => dueBucket(t.due_date, today) === b) })).filter((g) => g.tasks.length);
  const hoursThisWeek = open.filter((t) => ["overdue", "today", "week"].includes(dueBucket(t.due_date, today))).reduce((s, t) => s + t.estimate_hours, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="My work"
        subtitle={
          <>
            {displayName(email, people)} · {open.length} open task{open.length === 1 ? "" : "s"}
            {hoursThisWeek ? ` · about ${hoursThisWeek} h due in the next 7 days` : ""}
          </>
        }
      />

      {open.length === 0 && (
        <div className="rounded-xl bg-white p-10 text-center text-neutral-600 border border-line">
          Nothing assigned to you.{" "}
          <Link href="/projects" className="text-navy underline">
            Browse projects
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.bucket} className="rounded-xl bg-white border border-line">
          <h2 className={`border-b border-line px-4 py-2.5 text-sm font-semibold ${g.bucket === "overdue" ? "text-danger" : ""}`}>
            {BUCKET_LABEL[g.bucket]} <span className="font-normal text-neutral-500">· {g.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-line">
            {g.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <DoneBox id={t.id} title={t.title} done={false} disabled={!canWork} />
                <Link href={`/my-work?task=${t.id}`} scroll={false} className="min-w-0 flex-1 hover:text-navy">
                  <span className="block truncate font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {t.project_code} · {t.project_name}
                  </span>
                </Link>
                <PriorityFlag priority={t.priority} />
                <span className="hidden sm:inline">
                  <TaskStatusPill status={t.status} />
                </span>
                <span className={`w-16 text-right text-xs ${g.bucket === "overdue" ? "font-medium text-danger" : "text-neutral-500"}`}>
                  {t.due_date ? formatInvoiceDate(t.due_date).replace(/, \d{4}$/, "") : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="rounded-xl bg-white border border-line">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold text-neutral-600">Done in the last 7 days · {done.length}</h2>
          <ul className="divide-y divide-line">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm text-neutral-500">
                <DoneBox id={t.id} title={t.title} done disabled={!canWork} />
                <Link href={`/my-work?task=${t.id}`} scroll={false} className="min-w-0 flex-1 truncate line-through hover:text-navy">
                  {t.title}
                </Link>
                <span className="text-xs">{t.project_code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TaskDrawer people={people} canWork={canWork} me={email} />
    </div>
  );
}
