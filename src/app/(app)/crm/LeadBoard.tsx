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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { moveLead } from "@/app/actions/crm";
import { Select, btn } from "@/components/ui";
import { LOST_REASONS, SOURCE_LABEL, STAGES, type Lead, type Stage } from "@/lib/crm";
import { compactInr } from "@/lib/format";
import { formatShortDate } from "@/lib/money";
import { sortBetween } from "@/lib/pm";

type Cols = Record<Stage, Lead[]>;
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};
function group(leads: Lead[]): Cols {
  const c = Object.fromEntries(STAGES.map((s) => [s.key, [] as Lead[]])) as unknown as Cols;
  for (const l of leads) c[l.stage].push(l);
  for (const k of Object.keys(c) as Stage[]) c[k].sort((a, b) => a.sort - b.sort);
  return c;
}

export function LeadBoard({ leads, today, canEdit }: { leads: Lead[]; today: string; canEdit: boolean }) {
  const router = useRouter();
  const [cols, setCols] = useState<Cols>(() => group(leads));
  const [active, setActive] = useState<Lead | null>(null);
  const [lost, setLost] = useState<{ id: string; sort: number } | null>(null);
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();
  useEffect(() => setCols(group(leads)), [leads]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const colOf = (id: string): Stage | null => {
    if (STAGES.some((s) => s.key === id)) return id as Stage;
    for (const k of Object.keys(cols) as Stage[]) if (cols[k].some((l) => l.id === id)) return k;
    return null;
  };
  const onStart = (e: DragStartEvent) => {
    const c = colOf(String(e.active.id));
    setActive(c ? (cols[c].find((l) => l.id === e.active.id) ?? null) : null);
  };
  const onOver = (e: DragOverEvent) => {
    const from = colOf(String(e.active.id));
    const to = e.over ? colOf(String(e.over.id)) : null;
    if (!from || !to || from === to) return;
    setCols((c) => {
      const card = c[from].find((l) => l.id === e.active.id);
      if (!card) return c;
      const target = [...c[to]];
      const i = target.findIndex((l) => l.id === e.over!.id);
      target.splice(i < 0 ? target.length : i, 0, { ...card, stage: to });
      return { ...c, [from]: c[from].filter((l) => l.id !== e.active.id), [to]: target };
    });
  };
  const save = (id: string, stage: Stage, sort: number, lostReason = "") =>
    start(async () => {
      const r = await moveLead(id, stage, sort, lostReason);
      if (!r.ok) {
        setMsg(r.message);
        setCols(group(leads));
      } else {
        setMsg("");
        if (stage === "won") router.push(`/crm/${id}?convert=1`);
        else router.refresh();
      }
    });
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const col = colOf(String(e.active.id));
    if (!col || !e.over) return;
    const list = [...cols[col]];
    const from = list.findIndex((l) => l.id === e.active.id);
    const overIdx = list.findIndex((l) => l.id === e.over!.id);
    const to = overIdx < 0 ? list.length - 1 : overIdx;
    const [card] = list.splice(from, 1);
    list.splice(to, 0, card);
    const sort = sortBetween(list[to - 1]?.sort ?? null, list[to + 1]?.sort ?? null);
    const original = leads.find((l) => l.id === card.id);
    if (original && original.stage === col && original.sort === sort) return;
    list[to] = { ...card, stage: col, sort };
    setCols((c) => ({ ...c, [col]: list }));
    if (col === "lost" && original?.stage !== "lost") return setLost({ id: card.id, sort });
    save(card.id, col, sort);
  };

  return (
    <div>
      {msg && (
        <p className="mb-2 text-sm text-danger" role="alert">
          {msg}
        </p>
      )}
      {lost && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-warn/10 p-3 text-sm ring-1 ring-warn/20" role="dialog" aria-label="Why was it lost?">
          <span>Why was it lost?</span>
          <Select className="!w-56" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <button
            className={btn.primary}
            onClick={() => {
              save(lost.id, "lost", lost.sort, reason);
              setLost(null);
            }}
          >
            Mark lost
          </button>
          <button
            className={btn.ghost}
            onClick={() => {
              setLost(null);
              setCols(group(leads));
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => setCols(group(leads))}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
          {STAGES.map((s) => {
            const value = cols[s.key].reduce((t, l) => t + l.value, 0);
            return (
              <Column key={s.key} id={s.key} label={s.label} sub={`${cols[s.key].length}${value ? ` · ${compactInr(value)}` : ""}`}>
                <SortableContext items={cols[s.key].map((l) => l.id)} strategy={verticalListSortingStrategy}>
                  {cols[s.key].map((l) => (
                    <Sortable key={l.id} id={l.id} disabled={!canEdit}>
                      <Card lead={l} today={today} />
                    </Sortable>
                  ))}
                </SortableContext>
              </Column>
            );
          })}
        </div>
        <DragOverlay>{active ? <Card lead={active} today={today} lifted /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ id, label, sub, children }: { id: string; label: string; sub: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={label} className={`flex w-64 shrink-0 flex-col rounded-xl p-2 ${isOver ? "bg-navy/10" : "bg-neutral-100/80"}`}>
      <h3 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-neutral-700">
        {label}
        <span className="text-xs font-normal text-neutral-500">{sub}</span>
      </h3>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

function Sortable({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function Card({ lead: l, today, lifted }: { lead: Lead; today: string; lifted?: boolean }) {
  const due = l.follow_up_on && l.stage !== "won" && l.stage !== "lost" && l.follow_up_on <= today;
  return (
    <div className={`rounded-xl bg-white p-3 text-sm border border-line ${lifted ? "rotate-1 shadow-lg" : ""}`}>
      <Link href={`/crm/${l.id}`} className="block font-medium text-neutral-900 hover:text-navy" onPointerDown={(e) => e.stopPropagation()}>
        {l.company || l.name}
      </Link>
      {l.company && <div className="text-xs text-neutral-500">{l.name}</div>}
      <div className="mt-1 text-xs text-neutral-600">{[l.service, SOURCE_LABEL[l.source]].filter(Boolean).join(" · ")}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium tabular-nums">{l.value ? compactInr(l.value) : l.budget || ""}</span>
        {l.follow_up_on && l.stage !== "won" && l.stage !== "lost" && (
          <span className={due ? "font-semibold text-danger" : "text-neutral-500"}>
            {due ? "Follow up " : ""}
            {formatShortDate(l.follow_up_on)}
          </span>
        )}
        {l.stage === "lost" && l.lost_reason && <span className="text-neutral-500">{l.lost_reason}</span>}
      </div>
    </div>
  );
}
