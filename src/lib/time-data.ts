import "server-only";
import type { StudioEvent } from "./calendar";
import { requireTeam } from "./data";
import { addDays } from "./money";
import type { Leave, TimeEntry } from "./time";

type Row = Record<string, unknown>;

export interface TimeRow extends TimeEntry {
  project_name: string;
  project_code: string;
  task_title: string;
}

function toTime(r: Row): TimeRow {
  const p = r.projects as { name: string; code: string } | null;
  const t = r.tasks as { title: string } | null;
  return {
    ...(r as unknown as TimeEntry),
    minutes: Number(r.minutes ?? 0),
    project_name: p?.name ?? "",
    project_code: p?.code ?? "",
    task_title: t?.title ?? "",
  };
}

const TIME_SELECT = "*, projects(name, code), tasks(title)";

export async function runningTimer(): Promise<TimeRow | null> {
  const { supabase, email } = await requireTeam();
  const { data } = await supabase.from("time_entries").select(TIME_SELECT).eq("member_email", email).not("timer_started_at", "is", null).maybeSingle();
  return data ? toTime(data as Row) : null;
}

export async function myEntries(from: string, to: string): Promise<TimeRow[]> {
  const { supabase, email } = await requireTeam();
  const { data } = await supabase.from("time_entries").select(TIME_SELECT).eq("member_email", email).gte("work_date", from).lte("work_date", to).order("created_at");
  return ((data ?? []) as Row[]).map(toTime);
}

/** Everyone's time in a range (staff; RLS limits freelancers to their own). */
export async function teamEntries(from: string, to: string, status?: string): Promise<TimeRow[]> {
  const { supabase } = await requireTeam();
  let q = supabase.from("time_entries").select(TIME_SELECT).gte("work_date", from).lte("work_date", to).order("work_date");
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return ((data ?? []) as Row[]).map(toTime);
}

export async function submittedEntries(): Promise<TimeRow[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("time_entries").select(TIME_SELECT).eq("status", "submitted").order("work_date");
  return ((data ?? []) as Row[]).map(toTime);
}

export async function projectEntries(projectId: string): Promise<TimeRow[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("time_entries").select(TIME_SELECT).eq("project_id", projectId).order("work_date", { ascending: false });
  return ((data ?? []) as Row[]).map(toTime);
}

/** Projects a person can log time to (open ones), with their open tasks. */
export async function loggableProjects(): Promise<{ id: string; code: string; name: string; tasks: { id: string; title: string }[] }[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase
    .from("projects")
    .select("id, code, name, status, tasks(id, title, status, parent_id)")
    .not("status", "in", "(done,cancelled)")
    .order("code", { ascending: false });
  return ((data ?? []) as Row[]).map((p) => ({
    id: p.id as string,
    code: p.code as string,
    name: p.name as string,
    tasks: ((p.tasks as Row[]) ?? []).filter((t) => !t.parent_id && t.status !== "done").map((t) => ({ id: t.id as string, title: t.title as string })),
  }));
}

export interface Rate {
  email: string;
  name: string;
  role: string;
  cost_rate: number;
  bill_rate: number;
  weekly_capacity_hours: number;
}

export async function adminRates(): Promise<Rate[]> {
  const { supabase, isAdmin } = await requireTeam();
  if (!isAdmin) return [];
  const { data } = await supabase.rpc("admin_member_rates");
  return ((data ?? []) as Row[]).map((r) => ({ ...(r as unknown as Rate), cost_rate: Number(r.cost_rate), bill_rate: Number(r.bill_rate), weekly_capacity_hours: Number(r.weekly_capacity_hours) }));
}

export async function projectCosts(from?: string, to?: string) {
  const { supabase, isAdmin } = await requireTeam();
  if (!isAdmin) return [];
  const { data } = await supabase.rpc("admin_project_costs", { p_from: from ?? null, p_to: to ?? null });
  return ((data ?? []) as Row[]).map((r) => ({ project_id: r.project_id as string, member_email: r.member_email as string, minutes: Number(r.minutes), billable_minutes: Number(r.billable_minutes), cost: Number(r.cost) }));
}

export async function teamCapacity(): Promise<Map<string, number>> {
  const { supabase, isStaff } = await requireTeam();
  if (!isStaff) return new Map();
  const { data } = await supabase.rpc("team_capacity");
  return new Map(((data ?? []) as Row[]).map((r) => [r.email as string, Number(r.weekly_capacity_hours)]));
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export interface CalendarEvent extends StudioEvent {
  project_name: string;
  project_code: string;
}

function toEvent(r: Row): CalendarEvent {
  const p = r.projects as { name: string; code: string } | null;
  return {
    ...(r as unknown as StudioEvent),
    people: ((r.event_people as StudioEvent["people"]) ?? []).map((x) => ({ member_email: x.member_email, external_name: x.external_name, role: x.role, phone: x.phone })),
    kit: ((r.event_kit as { kit_id: string }[]) ?? []).map((k) => k.kit_id),
    project_name: p?.name ?? "",
    project_code: p?.code ?? "",
  };
}

const EVENT_SELECT = "*, event_people(member_email, external_name, role, phone), event_kit(kit_id), projects(name, code)";

/** Events overlapping [from, to] (IST dates, inclusive). */
export async function listEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .lt("starts_at", new Date(`${addDays(to, 1)}T00:00:00+05:30`).toISOString())
    .gte("ends_at", new Date(`${from}T00:00:00+05:30`).toISOString())
    .order("starts_at");
  return ((data ?? []) as Row[]).map(toEvent);
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const { supabase } = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabase.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle();
  return data ? toEvent(data as Row) : null;
}

export interface KitItem {
  id: string;
  name: string;
  category: string;
  serial: string;
  notes: string;
  active: boolean;
}

export async function listKit(): Promise<KitItem[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("kit").select("*").order("category").order("name");
  return (data ?? []) as KitItem[];
}

export interface LeaveRow extends Leave {
  id: string;
  kind: string;
  note: string;
  decided_by: string | null;
  created_at: string;
}

export async function listLeave(from?: string): Promise<LeaveRow[]> {
  const { supabase } = await requireTeam();
  let q = supabase.from("leave_requests").select("*").order("from_date", { ascending: false });
  if (from) q = q.gte("to_date", from);
  const { data } = await q;
  return (data ?? []) as LeaveRow[];
}

export async function listHolidays(): Promise<{ day: string; name: string }[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("holidays").select("*").order("day");
  return (data ?? []) as { day: string; name: string }[];
}
