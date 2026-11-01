"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateTask } from "@/app/actions/projects";
import { AvatarStack } from "@/components/pm/Avatar";
import { PriorityFlag, TaskStatusPill } from "@/components/pm/Pills";
import { formatInvoiceDate, formatShortDate, todayIso } from "@/lib/money";
import type { Person, Phase, Task } from "@/lib/pm";
import { useOpenTask } from "./useOpenTask";
import { QuickAdd } from "./QuickAdd";

/** Tasks grouped by phase, with a done checkbox and quick add per phase. */
export function TaskList({ projectId, tasks, phases, people, canWork }: { projectId: string; tasks: Task[]; phases: Phase[]; people: Person[]; canWork: boolean }) {
  const router = useRouter();
  const openTask = useOpenTask();
  const [pending, start] = useTransition();
  const today = todayIso();
  const top = tasks.filter((t) => !t.parent_id);
  const groups: { phase: Phase | null; tasks: Task[] }[] = [
    ...phases.map((p) => ({ phase: p, tasks: top.filter((t) => t.phase_id === p.id) })),
    { phase: null, tasks: top.filter((t) => !t.phase_id || !phases.some((p) => p.id === t.phase_id)) },
  ].filter((g) => g.phase || g.tasks.length || !phases.length);

  const toggle = (t: Task) =>
    start(async () => {
      await updateTask(t.id, { status: t.status === "done" ? "todo" : "done" });
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const done = g.tasks.filter((t) => t.status === "done").length;
        return (
          <section key={g.phase?.id ?? "none"} className="rounded-xl bg-white border border-line">
            <h3 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold">
              <span>{g.phase?.name ?? (phases.length ? "No phase" : "Tasks")}</span>
              <span className="text-xs font-normal text-neutral-500">
                {done}/{g.tasks.length} done{g.phase?.due_date ? ` · due ${formatInvoiceDate(g.phase.due_date)}` : ""}
              </span>
            </h3>
            <ul className="divide-y divide-line">
              {g.tasks.map((t) => {
                const overdue = t.due_date && t.status !== "done" && t.due_date < today;
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={t.status === "done"}
                      disabled={!canWork || pending}
                      onChange={() => toggle(t)}
                      aria-label={`Mark ${t.title} ${t.status === "done" ? "not done" : "done"}`}
                    />
                    <button
                      onClick={() => openTask(t.id)}
                      className={`min-w-0 flex-1 truncate text-left hover:text-navy ${t.status === "done" ? "text-neutral-400 line-through" : ""}`}
                    >
                      {t.title}
                    </button>
                    <PriorityFlag priority={t.priority} />
                    {t.subtasks && (
                      <span className="hidden text-xs text-neutral-500 sm:inline">
                        ☑ {t.subtasks.done}/{t.subtasks.total}
                      </span>
                    )}
                    <span className="hidden sm:inline">
                      <TaskStatusPill status={t.status} />
                    </span>
                    <span className={`w-20 text-right text-xs ${overdue ? "font-medium text-danger" : "text-neutral-500"}`}>{t.due_date ? formatShortDate(t.due_date) : ""}</span>
                    <span className="hidden w-12 text-right text-xs text-neutral-500 tabular-nums md:inline">{t.estimate_hours ? `${t.estimate_hours}h` : ""}</span>
                    <AvatarStack emails={t.assignees} people={people} max={2} />
                  </li>
                );
              })}
            </ul>
            {canWork && (
              <div className="px-2 py-1.5">
                <QuickAdd projectId={projectId} phaseId={g.phase?.id ?? null} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
