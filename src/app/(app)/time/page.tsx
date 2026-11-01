import Link from "next/link";
import { Card } from "@/components/ui";
import { requireTeam } from "@/lib/data";
import { addDays, formatInvoiceDate, todayIso } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { teamDirectory } from "@/lib/pm-data";
import { hhmm, weekStart } from "@/lib/time";
import { loggableProjects, myEntries, submittedEntries, teamEntries, timeApprovalOn } from "@/lib/time-data";
import { Approvals } from "./Approvals";
import { Timesheet } from "./Timesheet";

export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string; tab?: string }> }) {
  const { isAdmin, isStaff, canWork } = await requireTeam();
  const sp = await searchParams;
  const today = todayIso();
  const approval = await timeApprovalOn();
  const monday = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today);
  const tabs = [
    { key: "week", label: "My timesheet" },
    ...(isStaff ? [{ key: "team", label: "Team" }] : []),
    ...(isAdmin && approval ? [{ key: "approve", label: "Approve" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "week";
  const people = await teamDirectory();
  const names = Object.fromEntries(people.map((p) => [p.email, p.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Time</h1>
          <p className="text-sm text-neutral-500">Log hours against projects and tasks.{approval ? " Submit each week for approval." : ""}</p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Link href={`/time?tab=${tab}&week=${addDays(monday, -7)}`} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Previous week">
            ←
          </Link>
          <span className="px-2 font-medium">Week of {formatInvoiceDate(monday)}</span>
          <Link href={`/time?tab=${tab}&week=${addDays(monday, 7)}`} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Next week">
            →
          </Link>
          {monday !== weekStart(today) && (
            <Link href={`/time?tab=${tab}`} className="rounded-md px-2 py-1 text-navy hover:bg-neutral-100">
              This week
            </Link>
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-neutral-200" aria-label="Time sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/time?tab=${t.key}&week=${monday}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-navy font-medium text-navy" : "border-transparent text-neutral-600"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "week" && (
        <Timesheet monday={monday} entries={await myEntries(monday, addDays(monday, 6))} projects={await loggableProjects()} today={today} canWork={canWork} approval={approval} />
      )}
      {tab === "approve" && isAdmin && approval && <Approvals rows={await submittedEntries()} names={names} />}
      {tab === "team" && isStaff && <TeamWeek monday={monday} people={people} />}
    </div>
  );
}

async function TeamWeek({ monday, people }: { monday: string; people: { email: string; name: string }[] }) {
  const entries = await teamEntries(monday, addDays(monday, 6));
  const byPerson = new Map<string, typeof entries>();
  for (const e of entries) byPerson.set(e.member_email, [...(byPerson.get(e.member_email) ?? []), e]);
  return (
    <Card title="Who logged what this week">
      {!entries.length ? (
        <p className="text-sm text-neutral-500">No time logged this week.</p>
      ) : (
        <div className="space-y-4">
          {[...byPerson.entries()].map(([email, list]) => {
            const total = list.reduce((s, e) => s + e.minutes, 0);
            const byProject = new Map<string, number>();
            for (const e of list) byProject.set(`${e.project_code} · ${e.project_name}`, (byProject.get(`${e.project_code} · ${e.project_name}`) ?? 0) + e.minutes);
            return (
              <div key={email}>
                <div className="flex justify-between text-sm font-medium">
                  <span>{displayName(email, people)}</span>
                  <span className="tabular-nums">{hhmm(total)} h</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-sm text-neutral-600">
                  {[...byProject.entries()].map(([p, m]) => (
                    <li key={p} className="flex justify-between">
                      <span className="truncate">{p}</span>
                      <span className="tabular-nums">{hhmm(m)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
