import Link from "next/link";
import { Card } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { addDays, formatInvoiceDate, todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { availableDays, weekCapacity, weekLoad, weekStart } from "@/lib/time";
import { listEvents, listHolidays, listLeave, teamCapacity } from "@/lib/time-data";

const WEEKS = 6;

/** Staff: booked hours vs capacity per person per week (tasks due + shoots/meetings, minus leave). */
export default async function WorkloadPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { supabase } = await requireMember();
  const sp = await searchParams;
  const first = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : todayIso());
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(first, i * 7));
  const last = addDays(weeks[WEEKS - 1], 6);
  const [people, capacity, leave, holidays, events, { data: tasks }] = await Promise.all([
    teamDirectory(),
    teamCapacity(),
    listLeave(first),
    listHolidays(),
    listEvents(first, last),
    supabase.from("tasks").select("due_date, estimate_hours, status, task_assignees(member_email)").neq("status", "done").gte("due_date", first).lte("due_date", last),
  ]);
  const loadTasks = (tasks ?? []).map((t) => ({ due_date: t.due_date as string, estimate_hours: Number(t.estimate_hours), status: t.status as string, assignees: ((t.task_assignees as { member_email: string }[]) ?? []).map((a) => a.member_email) }));
  const loadEvents = events.map((e) => ({ starts_at: e.starts_at, ends_at: e.ends_at, status: e.status, type: e.type, people: e.people.map((p) => p.member_email).filter(Boolean) as string[] }));
  const holidayDays = holidays.map((h) => h.day);
  const workers = people.filter((p) => p.role !== "viewer");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/team/leave" className="text-sm text-neutral-500 hover:text-navy">
            Leave &amp; holidays →
          </Link>
          <h1 className="text-2xl font-semibold">Workload</h1>
          <p className="text-sm text-neutral-500">Hours booked per week (estimates of open tasks due that week, split between assignees, plus shoots and meetings) against each person&apos;s capacity after leave and holidays.</p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Link href={`/team/workload?from=${addDays(first, -7 * WEEKS)}`} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Earlier">
            ←
          </Link>
          <Link href="/team/workload" className="rounded-md px-2 py-1 text-navy hover:bg-neutral-100">
            Now
          </Link>
          <Link href={`/team/workload?from=${addDays(first, 7 * WEEKS)}`} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Later">
            →
          </Link>
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-2 font-medium">Person</th>
                {weeks.map((w) => (
                  <th key={w} className="text-center font-medium">
                    {formatInvoiceDate(w).replace(/, \d{4}$/, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {workers.map((p) => (
                <tr key={p.email}>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{p.name || p.email.split("@")[0]}</div>
                    <div className="text-xs text-neutral-500">
                      <span className="capitalize">{p.role}</span> · {capacity.get(p.email) ?? 40} h/week
                    </div>
                  </td>
                  {weeks.map((w) => {
                    const days = availableDays(w, p.email, leave, holidayDays);
                    const cap = weekCapacity(capacity.get(p.email) ?? 40, days);
                    const load = weekLoad(w, p.email, loadTasks, loadEvents);
                    const pct = cap > 0 ? Math.round((load.total / cap) * 100) : load.total > 0 ? 999 : 0;
                    const tone = pct > 100 ? "bg-red-100 text-red-900" : pct >= 80 ? "bg-amber-50 text-amber-900" : load.total ? "bg-green-50 text-green-900" : "text-neutral-400";
                    return (
                      <td key={w} className="px-1 py-1.5 text-center">
                        <div className={`rounded-lg px-2 py-1.5 ${tone}`} title={`Tasks ${load.tasks} h + events ${load.events} h, capacity ${cap} h (${days} working days)`}>
                          <div className="font-medium tabular-nums">
                            {load.total} / {cap} h
                          </div>
                          <div className="text-[11px]">{pct > 100 ? "Over" : load.total ? `${pct}%` : "Free"}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Green under 80% · amber 80–100% · red over capacity. Hover a cell for the breakdown. Capacity is set per person on the Team page.</p>
      </Card>
    </div>
  );
}
