import "server-only";
import { notFound } from "next/navigation";
import { requireTeam } from "./data";
import type { Comment, Deliverable, FileRow, Notification, Person, Phase, Task } from "./pm";
import type { AuditEvent, Project, ProjectFinance } from "./types";

type Row = Record<string, unknown>;

function toTask(r: Row): Task {
  const assignees = ((r.task_assignees as { member_email: string }[] | undefined) ?? []).map((a) => a.member_email);
  return {
    ...(r as unknown as Task),
    estimate_hours: Number(r.estimate_hours ?? 0),
    sort: Number(r.sort ?? 0),
    labels: (r.labels as string[]) ?? [],
    assignees,
  };
}

function toProject(r: Row): Project {
  return { ...(r as unknown as Project), budget_hours: Number(r.budget_hours ?? 0), retainer_hours_month: Number(r.retainer_hours_month ?? 0) };
}

export async function teamDirectory(): Promise<Person[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.rpc("team_directory");
  return (data ?? []) as Person[];
}

export interface ProjectCard extends Project {
  client_name: string;
  members: string[];
  tasks: Pick<Task, "status" | "due_date" | "parent_id" | "estimate_hours">[];
  finance: ProjectFinance | null;
}

/** Every project the signed-in person can see (RLS: staff all, freelancers their own). */
export async function listProjectCards(): Promise<ProjectCard[]> {
  const { supabase, isAdmin } = await requireTeam();
  const { data } = await supabase
    .from("projects")
    .select(`*, project_members(member_email), tasks(status, due_date, parent_id, estimate_hours)${isAdmin ? ", project_finance(*)" : ""}`)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const names = await clientNames(rows.map((r) => r.id as string));
  return rows.map((r) => ({
    ...toProject(r),
    client_name: names.get(r.id as string) ?? "",
    members: ((r.project_members as { member_email: string }[]) ?? []).map((m) => m.member_email),
    tasks: ((r.tasks as Row[]) ?? []).map((t) => ({ ...(t as unknown as Task), estimate_hours: Number(t.estimate_hours ?? 0) })),
    finance: toFinance(r.project_finance as Row | null),
  }));
}

function toFinance(f: Row | null | undefined): ProjectFinance | null {
  if (!f) return null;
  return {
    budget: Number(f.budget ?? 0),
    billing: (f.billing as ProjectFinance["billing"]) ?? "fixed",
    retainer_amount_month: Number(f.retainer_amount_month ?? 0),
  };
}

async function clientNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { supabase } = await requireTeam();
  const { data } = await supabase.rpc("project_client_names", { p_ids: ids });
  return new Map(((data ?? []) as { project_id: string; client_name: string }[]).map((r) => [r.project_id, r.client_name]));
}

export interface ProjectBundle {
  project: Project;
  client_name: string;
  finance: ProjectFinance | null;
  members: { email: string; role_on_project: string }[];
  phases: Phase[];
  tasks: Task[];
  deliverables: Deliverable[];
  files: FileRow[];
}

export async function getProjectBundle(id: string): Promise<ProjectBundle> {
  const { supabase, isAdmin } = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p, phases, tasks, deliverables, files, members, finance, names] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("phases").select("*").eq("project_id", id).order("sort"),
    supabase.from("tasks").select("*, task_assignees(member_email)").eq("project_id", id).order("sort"),
    supabase.from("deliverables").select("*").eq("project_id", id).order("sort"),
    supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_members").select("member_email, role_on_project").eq("project_id", id).order("added_at"),
    // the fee and retainer amount are the admin's
    isAdmin ? supabase.from("project_finance").select("*").eq("project_id", id).maybeSingle() : Promise.resolve({ data: null }),
    clientNames([id]),
  ]);
  if (!p.data) notFound();
  const all = ((tasks.data ?? []) as Row[]).map(toTask);
  const subCounts = new Map<string, { total: number; done: number }>();
  for (const t of all) {
    if (!t.parent_id) continue;
    const c = subCounts.get(t.parent_id) ?? { total: 0, done: 0 };
    c.total++;
    if (t.status === "done") c.done++;
    subCounts.set(t.parent_id, c);
  }
  return {
    project: toProject(p.data as Row),
    client_name: names.get(id) ?? "",
    finance: toFinance(finance.data as Row | null),
    members: ((members.data ?? []) as { member_email: string; role_on_project: string }[]).map((m) => ({ email: m.member_email, role_on_project: m.role_on_project })),
    phases: (phases.data ?? []) as Phase[],
    tasks: all.map((t) => ({ ...t, subtasks: subCounts.get(t.id) })),
    deliverables: (deliverables.data ?? []) as Deliverable[],
    files: ((files.data ?? []) as Row[]).map((f) => ({ ...(f as unknown as FileRow), size: Number(f.size ?? 0) })),
  };
}

export interface MyTask extends Task {
  project_name: string;
  project_code: string;
}

/** Open tasks assigned to me, plus anything I finished in the last 7 days. */
export async function listMyTasks(): Promise<MyTask[]> {
  const { supabase, email } = await requireTeam();
  const { data: mine } = await supabase.from("task_assignees").select("task_id").eq("member_email", email);
  const ids = (mine ?? []).map((m) => m.task_id as string);
  if (!ids.length) return [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from("tasks")
    .select("*, task_assignees(member_email), projects(name, code)")
    .in("id", ids)
    .or(`status.neq.done,completed_at.gte.${since}`)
    .order("due_date", { ascending: true, nullsFirst: false });
  return ((data ?? []) as Row[]).map((r) => {
    const pr = r.projects as { name: string; code: string } | null;
    return { ...toTask(r), project_name: pr?.name ?? "", project_code: pr?.code ?? "" };
  });
}

export interface TaskDetail {
  task: Task;
  project: Pick<Project, "id" | "name" | "code">;
  subtasks: Task[];
  comments: Comment[];
  files: FileRow[];
  phases: Phase[];
  members: string[];
  logged_minutes: number;
}

export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  const { supabase } = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data: t } = await supabase.from("tasks").select("*, task_assignees(member_email), projects(id, name, code)").eq("id", id).maybeSingle();
  if (!t) return null;
  const pid = t.project_id as string;
  const [subs, comments, files, phases, members, time] = await Promise.all([
    supabase.from("tasks").select("*, task_assignees(member_email)").eq("parent_id", id).order("sort"),
    supabase.from("task_comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("files").select("*").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("phases").select("*").eq("project_id", pid).order("sort"),
    supabase.from("project_members").select("member_email").eq("project_id", pid),
    // everyone's hours on the task, without who logged them
    supabase.rpc("project_minutes", { p_project: pid }),
  ]);
  return {
    task: toTask(t as Row),
    project: t.projects as Pick<Project, "id" | "name" | "code">,
    subtasks: ((subs.data ?? []) as Row[]).map(toTask),
    comments: (comments.data ?? []) as Comment[],
    files: ((files.data ?? []) as Row[]).map((f) => ({ ...(f as unknown as FileRow), size: Number(f.size ?? 0) })),
    phases: (phases.data ?? []) as Phase[],
    members: (members.data ?? []).map((m) => m.member_email as string),
    logged_minutes: ((time.data ?? []) as Row[]).filter((r) => r.task_id === id).reduce((sum, r) => sum + Number(r.minutes), 0),
  };
}

export async function listTemplates() {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("project_templates").select("id, name, type, description, billing, budget_hours, data").order("name");
  return (data ?? []).map((t) => ({
    ...(t as { id: string; name: string; type: string; description: string; billing: ProjectFinance["billing"]; data: { tasks: unknown[]; phases: string[] } }),
    budget_hours: Number(t.budget_hours),
    task_count: ((t.data as { tasks?: unknown[] })?.tasks ?? []).length,
  }));
}

export async function projectActivity(id: string, limit = 60): Promise<AuditEvent[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("audit_events").select("*").eq("project_id", id).order("at", { ascending: false }).limit(limit);
  return (data ?? []) as AuditEvent[];
}

export async function listNotifications(limit = 30): Promise<{ items: Notification[]; unread: number }> {
  const { supabase, email } = await requireTeam();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("*").eq("recipient_email", email).order("created_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_email", email).is("read_at", null),
  ]);
  return { items: (data ?? []) as Notification[], unread: count ?? 0 };
}
