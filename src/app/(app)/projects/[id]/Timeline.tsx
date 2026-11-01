import Link from "next/link";
import { addDays, daysBetween, formatInvoiceDate, formatShortDate } from "@/lib/money";
import { TASK_STATUS_LABEL, timelineRange, type Phase, type Task } from "@/lib/pm";

const DAY = 22; // px per day

/** Read-only bar view of tasks by phase. A task spans start→due; tasks with only a due date get one day. */
export function Timeline({ tasks, phases, today, projectId }: { tasks: Task[]; phases: Phase[]; today: string; projectId: string }) {
  const top = tasks.filter((t) => !t.parent_id && (t.due_date || t.start_date));
  const undated = tasks.filter((t) => !t.parent_id && !t.due_date && !t.start_date).length;
  if (!top.length) return <p className="rounded-xl bg-white p-6 text-sm text-neutral-500 border border-line">Give tasks a due date to see them here.</p>;

  const range = timelineRange(
    top.flatMap((t) => [t.start_date, t.due_date]),
    today,
  );
  const width = range.days * DAY;
  const x = (d: string) => daysBetween(range.from, d) * DAY;
  const weeks: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1) weeks.push(d);

  const rows: { phase: Phase | null; tasks: Task[] }[] = [
    ...phases.map((p) => ({ phase: p, tasks: top.filter((t) => t.phase_id === p.id) })),
    { phase: null, tasks: top.filter((t) => !t.phase_id || !phases.some((p) => p.id === t.phase_id)) },
  ].filter((r) => r.tasks.length);

  return (
    <div className="rounded-xl bg-white border border-line">
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: width + 220 }}>
          <div className="sticky top-0 flex h-8 border-b border-line text-xs text-neutral-500">
            <div className="sticky left-0 z-10 w-[220px] shrink-0 bg-white" />
            <div className="relative" style={{ width }}>
              {weeks.map((w) => (
                <span key={w} className="absolute top-2 border-l border-line pl-1" style={{ left: x(w) }}>
                  {formatShortDate(w)}
                </span>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.phase?.id ?? "none"}>
              <div className="sticky left-0 bg-neutral-50 px-4 py-1.5 text-xs font-semibold text-neutral-600" style={{ width: width + 220 }}>
                {r.phase?.name ?? "No phase"}
              </div>
              {r.tasks.map((t) => {
                const s = t.start_date && t.due_date && t.start_date < t.due_date ? t.start_date : (t.due_date ?? t.start_date!);
                const e = t.due_date ?? t.start_date!;
                const late = t.status !== "done" && e < today;
                return (
                  <div key={t.id} className="flex h-8 items-center border-b border-neutral-50">
                    <Link
                      href={`/projects/${projectId}?tab=timeline&task=${t.id}`}
                      scroll={false}
                      className="sticky left-0 z-10 w-[220px] shrink-0 truncate bg-white px-4 text-sm hover:text-navy"
                    >
                      {t.title}
                    </Link>
                    <div className="relative h-full" style={{ width }}>
                      <div
                        title={`${t.title}: ${formatInvoiceDate(s)} → ${formatInvoiceDate(e)} · ${TASK_STATUS_LABEL[t.status]}`}
                        className={`absolute top-2 h-4 rounded ${t.status === "done" ? "bg-neutral-300" : late ? "bg-danger" : "bg-accent"}`}
                        style={{ left: x(s) + 1, width: Math.max(DAY - 2, (daysBetween(s, e) + 1) * DAY - 2) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500" style={{ left: 220 + x(today) + DAY / 2 }} aria-hidden="true" />
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-neutral-500">
        Red line = today. Bars: blue planned, red late, grey done.{undated ? ` ${undated} task${undated === 1 ? " has" : "s have"} no dates.` : ""}
      </p>
    </div>
  );
}
