import Link from "next/link";
import { Avatar } from "@/components/pm/Avatar";
import { Card } from "@/components/ui";
import { eventDays, monthGrid, overlaps } from "@/lib/calendar";
import { requireTeam } from "@/lib/data";
import { addDays, formatInvoiceDate, todayIso } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { teamDirectory } from "@/lib/pm-data";
import { weekDays, weekStart } from "@/lib/time";
import { listEvents, listHolidays, listLeave } from "@/lib/time-data";
import { EventChip } from "./EventChip";
import { FeedLink } from "./FeedLink";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { canEdit, isStaff } = await requireTeam();
  const sp = await searchParams;
  const today = todayIso();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const view = sp.view === "week" || sp.view === "crew" ? sp.view : "month";
  const grid = monthGrid(date);
  const week = weekDays(weekStart(date));
  const from = view === "month" ? grid[0][0] : week[0];
  const to = view === "month" ? grid[5][6] : week[6];
  const [events, holidays, leave, people] = await Promise.all([listEvents(from, to), listHolidays(), isStaff ? listLeave(from) : Promise.resolve([]), teamDirectory()]);
  const onDay = (d: string) => events.filter((e) => eventDays(e).includes(d));
  const holiday = (d: string) => holidays.find((h) => h.day === d);
  const away = (d: string) => leave.filter((l) => l.status === "approved" && l.from_date <= d && d <= l.to_date);
  const [y, m] = date.split("-").map(Number);
  const prev = view === "month" ? addDays(`${date.slice(0, 7)}-01`, -1) : addDays(week[0], -7);
  const next = view === "month" ? new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) : addDays(week[0], 7);
  const href = (v: string, d: string) => `/calendar?view=${v}&date=${d}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-neutral-500">Shoots, meetings and deadlines, with crew and kit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <Link href="/calendar/kit" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm">
                Kit
              </Link>
              <Link href={`/calendar/new?date=${date}`} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
                New event
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          <Link href={href(view, prev)} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Previous">
            ←
          </Link>
          <span className="min-w-40 px-2 text-center font-medium">{view === "month" ? monthLabel(date) : `${short(week[0])} – ${short(week[6])}`}</span>
          <Link href={href(view, next)} className="rounded-md px-2 py-1 hover:bg-neutral-100" aria-label="Next">
            →
          </Link>
          <Link href={href(view, today)} className="rounded-md px-2 py-1 text-navy hover:bg-neutral-100">
            Today
          </Link>
        </div>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-black/10" role="group" aria-label="View">
          {[
            ["month", "Month"],
            ["week", "Week"],
            ...(isStaff ? [["crew", "Crew & kit"]] : []),
          ].map(([v, l]) => (
            <Link key={v} href={href(v, date)} aria-current={view === v ? "true" : undefined} className={`rounded-md px-3 py-1 text-sm ${view === v ? "bg-navy text-white" : "text-neutral-700 hover:bg-neutral-100"}`}>
              {l}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="grid min-w-[720px] grid-cols-7 border-b border-neutral-100 text-xs font-medium text-neutral-500">
            {DAY.map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid min-w-[720px] grid-cols-7">
            {grid.flat().map((d) => {
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              const h = holiday(d);
              const off = away(d);
              const list = onDay(d);
              return (
                <div key={d} className={`min-h-28 border-r border-b border-neutral-100 p-1.5 ${inMonth ? "" : "bg-neutral-50/70"} ${h ? "bg-amber-50/60" : ""}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={`${d === today ? "rounded-full bg-navy px-1.5 font-semibold text-white" : inMonth ? "text-neutral-700" : "text-neutral-400"}`}>{Number(d.slice(8))}</span>
                    {canEdit && (
                      <Link href={`/calendar/new?date=${d}`} className="text-neutral-300 hover:text-navy" aria-label={`New event on ${d}`}>
                        +
                      </Link>
                    )}
                  </div>
                  {h && <div className="mb-1 truncate text-[11px] text-amber-800">{h.name}</div>}
                  <div className="space-y-1">
                    {list.slice(0, 4).map((e) => (
                      <EventChip key={e.id} e={e} compact />
                    ))}
                    {list.length > 4 && (
                      <Link href={href("week", d)} className="block text-[11px] text-neutral-500">
                        +{list.length - 4} more
                      </Link>
                    )}
                  </div>
                  {off.length > 0 && <div className="mt-1 truncate text-[11px] text-neutral-500" title="On leave">Off: {off.map((l) => displayName(l.member_email, people)).join(", ")}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="space-y-3">
          {week.map((d) => {
            const list = onDay(d);
            const h = holiday(d);
            const off = away(d);
            return (
              <section key={d} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <h2 className={`mb-2 text-sm font-semibold ${d === today ? "text-navy" : ""}`}>
                  {formatInvoiceDate(d)} · {DAY[week.indexOf(d)]}
                  {h && <span className="ml-2 font-normal text-amber-800">{h.name}</span>}
                </h2>
                {list.length ? (
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="w-32">
                          <EventChip e={e} />
                        </span>
                        <span className="text-neutral-600">
                          {e.all_day ? "All day" : `${new Date(e.starts_at).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" })} – ${new Date(e.ends_at).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" })}`}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.project_code ? ` · ${e.project_code}` : ""}
                        </span>
                        <span className="flex -space-x-1.5">
                          {e.people.filter((p) => p.member_email).map((p) => (
                            <Avatar key={p.member_email} email={p.member_email!} people={people} size={22} />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-400">Nothing booked.</p>
                )}
                {off.length > 0 && <p className="mt-2 text-xs text-neutral-500">On leave: {off.map((l) => displayName(l.member_email, people)).join(", ")}</p>}
              </section>
            );
          })}
        </div>
      )}

      {view === "crew" && isStaff && <CrewView week={week} events={events} people={people} leave={leave} today={today} />}

      <Card title="Subscribe in Google Calendar">
        <FeedLink site={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />
      </Card>
    </div>
  );
}

async function CrewView({ week, events, people, leave, today }: { week: string[]; events: Awaited<ReturnType<typeof listEvents>>; people: { email: string; name: string; role: string }[]; leave: Awaited<ReturnType<typeof listLeave>>; today: string }) {
  const { listKit } = await import("@/lib/time-data");
  const kit = (await listKit()).filter((k) => k.active);
  const live = events.filter((e) => e.status !== "cancelled" && e.type !== "deadline");
  const booked = (pred: (e: (typeof live)[number]) => boolean, d: string) => live.filter((e) => pred(e) && eventDays(e).includes(d));
  const cell = (list: typeof live, off?: boolean) => (
    <div className="space-y-1">
      {off && <div className="rounded bg-neutral-100 px-1 text-[11px] text-neutral-500">Leave</div>}
      {list.map((e) => (
        <EventChip key={e.id} e={e} compact />
      ))}
      {list.some((a, i) => list.some((b, j) => j > i && overlaps(a, b))) && <div className="text-[11px] font-semibold text-red-700">Double-booked</div>}
    </div>
  );
  const head = (
    <tr className="text-left text-xs text-neutral-500">
      <th className="w-40 py-2 font-medium" />
      {week.map((d, i) => (
        <th key={d} className={`font-medium ${d === today ? "text-navy" : ""}`}>
          {DAY[i]} {Number(d.slice(8))}
        </th>
      ))}
    </tr>
  );
  return (
    <div className="space-y-5">
      <Card title="People">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead>{head}</thead>
            <tbody className="divide-y divide-neutral-100 align-top">
              {people.filter((p) => p.role !== "viewer").map((p) => (
                <tr key={p.email}>
                  <td className="truncate py-1.5 pr-2">{p.name || p.email.split("@")[0]}</td>
                  {week.map((d) => (
                    <td key={d} className="px-0.5 py-1.5">
                      {cell(booked((e) => e.people.some((x) => x.member_email === p.email), d), leave.some((l) => l.member_email === p.email && l.status === "approved" && l.from_date <= d && d <= l.to_date))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Kit">
        {kit.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead>{head}</thead>
              <tbody className="divide-y divide-neutral-100 align-top">
                {kit.map((k) => (
                  <tr key={k.id}>
                    <td className="truncate py-1.5 pr-2" title={k.serial}>
                      {k.name}
                      <span className="block text-xs text-neutral-400">{k.category}</span>
                    </td>
                    {week.map((d) => (
                      <td key={d} className="px-0.5 py-1.5">
                        {cell(booked((e) => e.kit.includes(k.id), d))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            No kit yet. <Link href="/calendar/kit" className="text-navy underline">Add cameras, lenses and lights</Link> to book them on shoots.
          </p>
        )}
      </Card>
      <p className="text-xs text-neutral-500">Dashed = tentative.</p>
    </div>
  );
}
