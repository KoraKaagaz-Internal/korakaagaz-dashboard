// Project-management types and pure helpers (no I/O), shared by server and client code.
import { addDays, daysBetween } from "./money";
import type { ProjectStatus } from "./types";

export type TaskStatus = "todo" | "doing" | "review" | "client_review" | "done";
export type Priority = "low" | "normal" | "high" | "urgent";

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "review", label: "Internal review" },
  { key: "client_review", label: "With client" },
  { key: "done", label: "Done" },
];
export const TASK_STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.key, s.label])) as Record<TaskStatus, string>;

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];

export const PROJECT_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: "planned", label: "Planned" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];
export const PROJECT_STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.key, s.label])) as Record<ProjectStatus, string>;

export const PROJECT_TYPES = ["branding", "photography", "retainer", "packaging", "web", "other"] as const;

export interface Person {
  email: string;
  name: string;
  role: string;
  joined: boolean;
}

export interface Task {
  id: string;
  project_id: string;
  phase_id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  estimate_hours: number;
  labels: string[];
  sort: number;
  client_visible: boolean;
  completed_at: string | null;
  created_at: string;
  assignees: string[];
  subtasks?: { total: number; done: number };
}

export interface Phase {
  id: string;
  project_id: string;
  name: string;
  sort: number;
  due_date: string | null;
}

export interface Deliverable {
  id: string;
  project_id: string;
  name: string;
  qty: number;
  revision_limit: number;
  status: "pending" | "in_progress" | "delivered";
  due_date: string | null;
  sort: number;
}

export interface FileRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  kind: "upload" | "link";
  storage_path: string | null;
  url: string | null;
  name: string;
  size: number;
  mime: string;
  uploaded_by: string;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_email: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface Notification {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  actor_email: string;
  read_at: string | null;
  created_at: string;
}

/** Sort key between two neighbours (fractional indexing, so a move updates one row). */
export function sortBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/** Done / total of top-level tasks, by count and by estimated hours. */
export function progress(tasks: Pick<Task, "status" | "estimate_hours" | "parent_id">[]) {
  const top = tasks.filter((t) => !t.parent_id);
  const done = top.filter((t) => t.status === "done");
  const hours = top.reduce((s, t) => s + t.estimate_hours, 0);
  const doneHours = done.reduce((s, t) => s + t.estimate_hours, 0);
  return {
    total: top.length,
    done: done.length,
    pct: top.length ? Math.round((done.length / top.length) * 100) : 0,
    hours,
    doneHours,
  };
}

export type Health = "on_track" | "at_risk" | "late" | "closed";

/**
 * Late: past the project due date, or any open task overdue by more than 3 days.
 * At risk: an open task overdue, or due within 7 days with under 75% of tasks done.
 */
export function projectHealth(
  p: { status: ProjectStatus; due_date: string | null },
  tasks: Pick<Task, "status" | "due_date" | "parent_id" | "estimate_hours">[],
  today: string,
): Health {
  if (p.status === "done" || p.status === "cancelled") return "closed";
  const open = tasks.filter((t) => t.status !== "done");
  if (p.due_date && p.due_date < today) return "late";
  if (open.some((t) => t.due_date && daysBetween(t.due_date, today) > 3)) return "late";
  if (open.some((t) => t.due_date && t.due_date < today)) return "at_risk";
  if (p.due_date && daysBetween(today, p.due_date) <= 7 && progress(tasks as Task[]).pct < 75) return "at_risk";
  return "on_track";
}

export const HEALTH_LABEL: Record<Health, string> = { on_track: "On track", at_risk: "At risk", late: "Late", closed: "Closed" };

export type Bucket = "overdue" | "today" | "week" | "later" | "no_date";
export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  no_date: "No due date",
};

export function dueBucket(due: string | null, today: string): Bucket {
  if (!due) return "no_date";
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due <= addDays(today, 7)) return "week";
  return "later";
}

/** Emails mentioned as @name or @email in a comment, matched against the team. */
export function mentionedEmails(body: string, people: Pick<Person, "email" | "name">[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  for (const p of people) {
    const handles = [p.email.toLowerCase(), p.email.split("@")[0].toLowerCase()];
    const first = p.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) handles.push(first);
    if (handles.some((h) => new RegExp(`(^|\\s)@${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`).test(text))) found.add(p.email);
  }
  return [...found];
}

/** Date range covering every dated task/phase, padded, for the timeline view. */
export function timelineRange(dates: (string | null)[], today: string): { from: string; to: string; days: number } {
  const real = dates.filter(Boolean) as string[];
  const min = real.length ? real.reduce((a, b) => (a < b ? a : b)) : today;
  const max = real.length ? real.reduce((a, b) => (a > b ? a : b)) : addDays(today, 30);
  const from = addDays(min < today ? min : today, -2);
  const to = addDays(max, 3);
  return { from, to, days: daysBetween(from, to) + 1 };
}

export function displayName(email: string, people: Pick<Person, "email" | "name">[]): string {
  const p = people.find((x) => x.email === email);
  return p?.name || email.split("@")[0];
}

export function initials(name: string): string {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
