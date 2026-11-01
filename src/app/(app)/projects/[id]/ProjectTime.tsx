import { ProgressBar } from "@/components/pm/Pills";
import { Card } from "@/components/ui";
import { formatShortDate, todayIso } from "@/lib/money";
import { displayName, type Person } from "@/lib/pm";
import { hhmm, monthRange, retainerBurn } from "@/lib/time";
import { projectEntries, timeApprovalOn } from "@/lib/time-data";
import type { Project } from "@/lib/types";

const STATUS_TEXT = { draft: "Draft", submitted: "Waiting approval", approved: "Approved", rejected: "Sent back" } as const;

/** Hours logged vs the budget, retainer hours this month, who logged what. No money. */
export async function ProjectTime({ project, people }: { project: Project; people: Person[] }) {
  const [entries, approval] = await Promise.all([projectEntries(project.id), timeApprovalOn()]);
  const done = entries.filter((e) => !e.timer_started_at);
  const total = done.reduce((s, e) => s + e.minutes, 0);
  const approved = done.filter((e) => e.status === "approved").reduce((s, e) => s + e.minutes, 0);
  const month = monthRange(todayIso());
  const thisMonth = done.filter((e) => e.work_date >= month.from && e.work_date <= month.to).reduce((s, e) => s + e.minutes, 0);
  const burn = project.retainer_hours_month ? retainerBurn(thisMonth, project.retainer_hours_month) : null;
  const byPerson = new Map<string, number>();
  for (const e of done) byPerson.set(e.member_email, (byPerson.get(e.member_email) ?? 0) + e.minutes);
  const hoursPct = project.budget_hours ? Math.round((total / 60 / project.budget_hours) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white px-4 py-3 border border-line">
          <div className="text-xs text-neutral-500">Logged</div>
          <div className="text-lg font-semibold tabular-nums">{hhmm(total)} h</div>
          {project.budget_hours > 0 && (
            <div className="mt-1">
              <ProgressBar pct={hoursPct} label={`${hoursPct}% of ${project.budget_hours} budgeted hours`} />
              <div className={`text-xs ${hoursPct > 100 ? "font-medium text-danger" : "text-neutral-500"}`}>of {project.budget_hours} h budget</div>
            </div>
          )}
        </div>
        {burn && (
          <div className="rounded-xl bg-white px-4 py-3 border border-line">
            <div className="text-xs text-neutral-500">Retainer this month</div>
            <div className="text-lg font-semibold tabular-nums">
              {burn.usedHours} / {burn.includedHours} h
            </div>
            <div className="mt-1">
              <ProgressBar pct={burn.pct} label={`${burn.pct}% of the monthly hours used`} />
            </div>
            <div className={`text-xs ${burn.overHours ? "font-medium text-danger" : "text-neutral-500"}`}>
              {burn.overHours ? `${burn.overHours} h over: bill extra or roll back` : `${burn.leftHours} h left`}
            </div>
          </div>
        )}
        {!burn && (
          <div className="rounded-xl bg-white px-4 py-3 border border-line">
            <div className="text-xs text-neutral-500">This month</div>
            <div className="text-lg font-semibold tabular-nums">{hhmm(thisMonth)} h</div>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card title="By person">
          {byPerson.size ? (
            <ul className="space-y-1 text-sm">
              {[...byPerson.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([e, m]) => (
                  <li key={e} className="flex justify-between">
                    <span>{displayName(e, people)}</span>
                    <span className="tabular-nums">{hhmm(m)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No time logged yet.</p>
          )}
          {approval && <p className="mt-3 text-xs text-neutral-500">Approved: {hhmm(approved)} h</p>}
        </Card>
        <Card title="Entries">
          {entries.length ? (
            <ul className="divide-y divide-line text-sm">
              {entries.slice(0, 100).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 text-xs text-neutral-500">{formatShortDate(e.work_date)}</span>
                  <span className="w-28 truncate">{displayName(e.member_email, people)}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-600">
                    {e.task_title || "General"}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  <span className="text-xs text-neutral-500">{e.timer_started_at ? "● running" : approval ? STATUS_TEXT[e.status] : ""}</span>
                  <span className="w-12 text-right tabular-nums">{e.timer_started_at ? "" : hhmm(e.minutes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Log time from the Time page or start a timer on a task.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
