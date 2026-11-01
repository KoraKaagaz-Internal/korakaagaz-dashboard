import Link from "next/link";
import { istTime, type EventType, type EventStatus } from "@/lib/calendar";

export const TYPE_STYLE: Record<EventType, string> = {
  shoot: "bg-accent/10 text-navy ring-accent/30",
  meeting: "bg-violet-50 text-violet-900 ring-violet-200",
  deadline: "bg-danger/5 text-danger ring-danger/20",
  other: "bg-neutral-100 text-neutral-700 ring-neutral-200",
};
export const TYPE_LABEL: Record<EventType, string> = { shoot: "Shoot", meeting: "Meeting", deadline: "Deadline", other: "Other" };

export function EventChip({
  e,
  compact,
}: {
  e: { id: string; type: EventType; title: string; starts_at: string; all_day: boolean; status: EventStatus; project_code?: string };
  compact?: boolean;
}) {
  const cancelled = e.status === "cancelled";
  return (
    <Link
      href={`/calendar/${e.id}`}
      title={`${TYPE_LABEL[e.type]}: ${e.title}${e.status !== "confirmed" ? ` (${e.status})` : ""}`}
      className={`block truncate rounded-md px-1.5 py-0.5 text-xs ring-1 ${TYPE_STYLE[e.type]} ${e.status === "tentative" ? "border border-dashed border-current ring-0" : ""} ${cancelled ? "line-through opacity-60" : ""}`}
    >
      {!e.all_day && <span className="mr-1 tabular-nums">{istTime(e.starts_at)}</span>}
      {!compact && <span className="sr-only">{TYPE_LABEL[e.type]}: </span>}
      {e.title}
    </Link>
  );
}
