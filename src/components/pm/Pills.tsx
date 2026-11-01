import type { Health, Priority, TaskStatus } from "@/lib/pm";
import { HEALTH_LABEL, TASK_STATUS_LABEL } from "@/lib/pm";

const HEALTH_STYLE: Record<Health, string> = {
  on_track: "bg-ok/10 text-ok",
  at_risk: "bg-warn/10 text-warn",
  late: "bg-danger/10 text-danger",
  closed: "bg-neutral-100 text-neutral-600",
};

export function HealthPill({ health }: { health: Health }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${HEALTH_STYLE[health]}`}>{HEALTH_LABEL[health]}</span>;
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-neutral-100 text-neutral-700",
  doing: "bg-blue-100 text-navy",
  review: "bg-violet-100 text-violet-800",
  client_review: "bg-warn/10 text-warn",
  done: "bg-ok/10 text-ok",
};

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>{TASK_STATUS_LABEL[status]}</span>;
}

export function PriorityFlag({ priority }: { priority: Priority }) {
  if (priority === "normal" || priority === "low") return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${priority === "urgent" ? "bg-danger text-white" : "bg-danger/5 text-danger"}`}>{priority}</span>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="h-1.5 flex-1 rounded-full bg-neutral-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%`, minWidth: pct ? 4 : 0 }} />
      </div>
      <span className="w-9 text-right text-xs text-neutral-500 tabular-nums">{pct}%</span>
    </div>
  );
}
