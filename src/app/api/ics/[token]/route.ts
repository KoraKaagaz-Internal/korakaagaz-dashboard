import { toIcs, type IcsItem } from "@/lib/calendar";
import { addDays, todayIso } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Private, read-only calendar feed for one person (subscribe from Google/Apple Calendar).
 * The 32-hex token is the only key; rotating it in the app breaks old subscriptions.
 * Includes: shoots/meetings they're booked on, due dates of their open tasks, their approved
 * leave, and studio holidays, from 60 days ago to a year ahead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{32}$/.test(token)) return new Response("Not found", { status: 404 });
  const db = createAdminClient();
  const { data: member } = await db.from("members").select("email, name").eq("ics_token", token).maybeSingle();
  if (!member) return new Response("Not found", { status: 404 });
  const email = member.email as string;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const from = addDays(todayIso(), -60);
  const to = addDays(todayIso(), 366);

  const [{ data: bookings }, { data: assigned }, { data: leave }, { data: holidays }] = await Promise.all([
    db.from("event_people").select("events(id, type, title, starts_at, ends_at, all_day, location, status, call_time, notes, updated_at, projects(code, name))").eq("member_email", email),
    db.from("task_assignees").select("tasks(id, title, due_date, status, updated_at, projects(code, name, id))").eq("member_email", email),
    db.from("leave_requests").select("id, from_date, to_date, kind, half_day").eq("member_email", email).eq("status", "approved").gte("to_date", from),
    db.from("holidays").select("day, name").gte("day", from).lte("day", to),
  ]);

  type Ev = { id: string; type: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string; status: string; call_time: string | null; notes: string; updated_at: string; projects: { code: string; name: string } | null };
  type Tk = { id: string; title: string; due_date: string | null; status: string; updated_at: string; projects: { code: string; name: string; id: string } | null };
  const items: IcsItem[] = [];
  for (const b of (bookings ?? []) as unknown as { events: Ev | null }[]) {
    const e = b.events;
    if (!e || e.status === "cancelled" || e.ends_at < `${from}T00:00:00Z`) continue;
    const day = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);
    items.push({
      uid: `event-${e.id}`,
      title: `${e.type === "shoot" ? "Shoot: " : ""}${e.title}${e.projects ? ` (${e.projects.code})` : ""}`,
      start: e.all_day ? day(e.starts_at) : e.starts_at,
      end: e.all_day ? day(e.ends_at) : e.ends_at,
      allDay: e.all_day,
      location: e.location,
      description: [e.call_time ? `Call time ${e.call_time.slice(0, 5)}` : "", e.notes].filter(Boolean).join("\n"),
      url: site ? `${site}/calendar/${e.id}` : undefined,
      tentative: e.status === "tentative",
      updated: e.updated_at,
    });
  }
  for (const a of (assigned ?? []) as unknown as { tasks: Tk | null }[]) {
    const t = a.tasks;
    if (!t?.due_date || t.status === "done" || t.due_date < from) continue;
    items.push({
      uid: `task-${t.id}`,
      title: `Due: ${t.title}${t.projects ? ` (${t.projects.code})` : ""}`,
      start: t.due_date,
      end: t.due_date,
      allDay: true,
      url: site && t.projects ? `${site}/projects/${t.projects.id}?task=${t.id}` : undefined,
      updated: t.updated_at,
    });
  }
  for (const l of leave ?? []) {
    items.push({ uid: `leave-${l.id}`, title: `Leave${l.half_day ? " (half day)" : ""}`, start: l.from_date as string, end: l.to_date as string, allDay: true });
  }
  for (const h of holidays ?? []) {
    items.push({ uid: `holiday-${h.day}`, title: `Holiday: ${h.name}`, start: h.day as string, end: h.day as string, allDay: true });
  }

  const name = `Kora Kaagaz · ${member.name || email.split("@")[0]}`;
  return new Response(toIcs(name, items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
    },
  });
}
