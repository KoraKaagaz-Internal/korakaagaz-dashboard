"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { moveTask } from "@/app/actions/projects";
import { AvatarStack } from "@/components/pm/Avatar";
import { PriorityFlag } from "@/components/pm/Pills";
import { formatInvoiceDate, todayIso } from "@/lib/money";
import { TASK_STATUSES, sortBetween, type Person, type Phase, type Task, type TaskStatus } from "@/lib/pm";
import { QuickAdd } from "./QuickAdd";
import { useOpenTask } from "./useOpenTask";

type Columns = Record<TaskStatus, Task[]>;

// Whatever is under the pointer wins (a card before its column). Corner-distance detection
// picks the wrong column when columns are stretched to the tallest one.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function group(tasks: Task[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s.key, [] as Task[]])) as unknown as Columns;
  for (const t of tasks) if (!t.parent_id) cols[t.status].push(t);
  for (const k of Object.keys(cols) as TaskStatus[]) cols[k].sort((a, b) => a.sort - b.sort);
  return cols;
}

export function Board({ projectId, tasks, phases, people, canWork }: { projectId: string; tasks: Task[]; phases: Phase[]; people: Person[]; canWork: boolean }) {
  const router = useRouter();
  const openTask = useOpenTask();
  const [cols, setCols] = useState<Columns>(() => group(tasks));
  const [active, setActive] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  useEffect(() => setCols(group(tasks)), [tasks]);
  const phaseName = useMemo(() => new Map(phases.map((p) => [p.id, p.name])), [phases]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const columnOf = (id: string): TaskStatus | null => {
    if ((TASK_STATUSES.map((s) => s.key) as string[]).includes(id)) return id as TaskStatus;
    for (const k of Object.keys(cols) as TaskStatus[]) if (cols[k].some((t) => t.id === id)) return k;
    return null;
  };

  const onStart = (e: DragStartEvent) => {
    const col = columnOf(String(e.active.id));
    setActive(col ? (cols[col].find((t) => t.id === e.active.id) ?? null) : null);
  };

  // Move the card between columns while dragging so the drop position is visible.
  const onOver = (e: DragOverEvent) => {
    const from = columnOf(String(e.active.id));
    const to = e.over ? columnOf(String(e.over.id)) : null;
    if (!from || !to || from === to) return;
    setCols((c) => {
      const card = c[from].find((t) => t.id === e.active.id);
      if (!card) return c;
      const target = [...c[to]];
      const overIdx = target.findIndex((t) => t.id === e.over!.id);
      target.splice(overIdx < 0 ? target.length : overIdx, 0, { ...card, status: to });
      return { ...c, [from]: c[from].filter((t) => t.id !== e.active.id), [to]: target };
    });
  };

  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const col = columnOf(String(e.active.id));
    if (!col || !e.over) return;
    const list = [...cols[col]];
    const from = list.findIndex((t) => t.id === e.active.id);
    const overIdx = list.findIndex((t) => t.id === e.over!.id);
    const to = overIdx < 0 ? list.length - 1 : overIdx;
    const [card] = list.splice(from, 1);
    list.splice(to, 0, card);
    const sort = sortBetween(list[to - 1]?.sort ?? null, list[to + 1]?.sort ?? null);
    const original = tasks.find((t) => t.id === card.id);
    if (original && original.status === col && original.sort === sort) return;
    list[to] = { ...card, status: col, sort };
    setCols((c) => ({ ...c, [col]: list }));
    start(async () => {
      const r = await moveTask(card.id, col, sort);
      if (!r.ok) {
        setError(r.message);
        setCols(group(tasks));
      } else {
        setError("");
        router.refresh();
      }
    });
  };

  const today = todayIso();

  return (
    <div>
      {error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setCols(group(tasks))}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
          {TASK_STATUSES.map((s) => (
            <Column key={s.key} id={s.key} label={s.label} count={cols[s.key].length}>
              <SortableContext items={cols[s.key].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {cols[s.key].map((t) => (
                  <SortableCard key={t.id} task={t} disabled={!canWork}>
                    <Card task={t} phase={t.phase_id ? phaseName.get(t.phase_id) : undefined} people={people} today={today} onOpen={() => openTask(t.id)} />
                  </SortableCard>
                ))}
              </SortableContext>
              {canWork && <QuickAdd projectId={projectId} status={s.key} />}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {active ? <Card task={active} phase={active.phase_id ? phaseName.get(active.phase_id) : undefined} people={people} today={today} lifted /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={label} className={`flex w-72 shrink-0 flex-col rounded-xl p-2 ${isOver ? "bg-navy/10" : "bg-neutral-100/80"}`}>
      <h3 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-neutral-700">
        {label}
        <span className="text-xs font-normal text-neutral-500">{count}</span>
      </h3>
      <div className="flex min-h-12 flex-col gap-2">{children}</div>
    </section>
  );
}

function SortableCard({ task, disabled, children }: { task: Task; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function Card({ task: t, phase, people, today, onOpen, lifted }: { task: Task; phase?: string; people: Person[]; today: string; onOpen?: () => void; lifted?: boolean }) {
  const overdue = t.due_date && t.status !== "done" && t.due_date < today;
  return (
    <div
      role="button"
      tabIndex={-1}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.()}
      className={`cursor-pointer rounded-xl bg-white p-3 text-sm border border-line hover:ring-navy/30 ${lifted ? "rotate-1 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className={`min-w-0 flex-1 font-medium ${t.status === "done" ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{t.title}</span>
        <PriorityFlag priority={t.priority} />
      </div>
      {phase && <div className="mt-1 text-xs text-neutral-500">{phase}</div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-neutral-500">
          {t.due_date && <span className={overdue ? "font-medium text-red-700" : ""}>{formatInvoiceDate(t.due_date).replace(/, \d{4}$/, "")}</span>}
          {t.subtasks && (
            <span title="Subtasks done">
              ☑ {t.subtasks.done}/{t.subtasks.total}
            </span>
          )}
          {t.client_visible && <span title="Client can see this task">Client</span>}
        </span>
        <AvatarStack emails={t.assignees} people={people} max={2} />
      </div>
    </div>
  );
}
