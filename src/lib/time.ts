// Time-tracking, workload and retainer maths (pure; dates are ISO yyyy-mm-dd in IST).
import { addDays, daysBetween } from "./money";

export type TimeStatus = "draft" | "submitted" | "approved" | "rejected";

export interface TimeEntry {
  id: string;
  member_email: string;
  project_id: string;
  task_id: string | null;
  work_date: string;
  minutes: number;
  note: string;
  status: TimeStatus;
  timer_started_at: string | null;
  invoiced_document_id: string | null;
}

/** 90 → "1:30". */
export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** 90 → "1.5 h". */
export function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} h`;
}

/**
 * Reads what people type in a timesheet cell: "1:30", "1.5", "1,5", "90m", "2h", "2h 15m".
 * Returns minutes, or null when it can't be read. Empty means 0.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h?$/))) return Math.round(Number(m[1]) * 60);
  if ((m = s.match(/^(\d+)\s*m(in)?$/))) return Number(m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m(in)?$/))) return Math.round(Number(m[1]) * 60) + Number(m[2]);
  return null;
}

/** Minutes a running timer has counted, rounded up to the next minute, capped at 24 h. */
export function timerMinutes(startedAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(startedAt).getTime();
  return Math.min(1440, Math.max(1, Math.ceil(ms / 60000)));
}

/** Monday of the week containing the date. */
export function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

export interface Leave {
  member_email: string;
  from_date: string;
  to_date: string;
  half_day: boolean;
  status: "pending" | "approved" | "declined";
}

/** Working days (Mon–Fri) in a week minus holidays, minus approved leave for that person. */
export function availableDays(monday: string, email: string, leave: Leave[], holidays: string[]): number {
  let days = 0;
  for (const d of weekDays(monday)) {
    if (isWeekend(d) || holidays.includes(d)) continue;
    const off = leave.find((l) => l.member_email === email && l.status === "approved" && l.from_date <= d && d <= l.to_date);
    days += off ? (off.half_day ? 0.5 : 0) : 1;
  }
  return days;
}

export interface LoadTask {
  due_date: string | null;
  estimate_hours: number;
  status: string;
  assignees: string[];
}

export interface LoadEvent {
  starts_at: string;
  ends_at: string;
  status: string;
  type: string;
  people: string[];
}

/**
 * Hours booked for a person in a week: estimates of their open tasks due that week (split
 * evenly between assignees) plus shoots/meetings they're on (capped at 10 h a day).
 */
export function weekLoad(monday: string, email: string, tasks: LoadTask[], events: LoadEvent[]): { tasks: number; events: number; total: number } {
  const sunday = addDays(monday, 6);
  let t = 0;
  for (const task of tasks) {
    if (task.status === "done" || !task.due_date || !task.assignees.includes(email)) continue;
    if (task.due_date < monday || task.due_date > sunday) continue;
    t += task.estimate_hours / task.assignees.length;
  }
  let e = 0;
  const weekStartMs = Date.parse(`${monday}T00:00:00+05:30`);
  const weekEndMs = Date.parse(`${addDays(sunday, 1)}T00:00:00+05:30`);
  for (const ev of events) {
    if (ev.status === "cancelled" || ev.type === "deadline" || !ev.people.includes(email)) continue;
    const s = Math.max(Date.parse(ev.starts_at), weekStartMs);
    const f = Math.min(Date.parse(ev.ends_at), weekEndMs);
    if (f <= s) continue;
    const spanHours = (f - s) / 3600000;
    const days = Math.max(1, Math.ceil(spanHours / 24));
    e += Math.min(spanHours, days * 10);
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return { tasks: round(t), events: round(e), total: round(t + e) };
}

/** Hours this person can work in the week. */
export function weekCapacity(weeklyHours: number, days: number): number {
  return Math.round(((weeklyHours * days) / 5) * 10) / 10;
}

/** Days from the 1st to the last of the month containing the date. */
export function monthRange(iso: string): { from: string; to: string } {
  const from = `${iso.slice(0, 7)}-01`;
  const [y, m] = from.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

export function sumMinutes(entries: Pick<TimeEntry, "minutes">[]): number {
  return entries.reduce((s, e) => s + e.minutes, 0);
}

export function daysInclusive(from: string, to: string) {
  return daysBetween(from, to) + 1;
}
