"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember, requireTeam } from "@/lib/data";
import { todayIso } from "@/lib/money";
import { mentionedEmails, type Person } from "@/lib/pm";
import { getTaskDetail } from "@/lib/pm-data";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
type Supa = Awaited<ReturnType<typeof requireTeam>>["supabase"];

const fail = (message: string) => ({ ok: false as const, message });
const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(", ");
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().or(z.literal("").transform(() => null));

/** In-app notifications for everyone except the actor. */
async function notify(supabase: Supa, me: string, to: string[], n: { kind: string; title: string; body?: string; link: string }) {
  const rows = [...new Set(to)].filter((e) => e && e !== me).map((e) => ({ recipient_email: e, kind: n.kind, title: n.title, body: n.body ?? "", link: n.link }));
  if (rows.length) await supabase.from("notifications").insert(rows);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
const projectSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required"),
  client_id: uuid.nullable().or(z.literal("").transform(() => null)),
  type: z.string().trim().default(""),
  description: z.string().trim().default(""),
  status: z.enum(["planned", "active", "on_hold", "review", "done", "cancelled"]).default("active"),
  start_date: date.default(null),
  due_date: date.default(null),
  owner_email: z.string().email().nullable().or(z.literal("").transform(() => null)).default(null),
  budget_hours: z.coerce.number().min(0).default(0),
  retainer_hours_month: z.coerce.number().min(0).default(0),
  colour: z.string().default(""),
});

const financeSchema = z.object({
  budget: z.coerce.number().min(0).default(0),
  billing: z.enum(["fixed", "hourly", "retainer"]).default("fixed"),
  hourly_rate: z.coerce.number().min(0).default(0),
  retainer_amount_month: z.coerce.number().min(0).default(0),
});

export async function createProject(input: {
  project: z.input<typeof projectSchema>;
  finance?: z.input<typeof financeSchema>;
  template_id?: string | null;
  members?: string[];
}): Promise<Result<{ id: string; code: string }>> {
  const { supabase, email } = await requireMember("member");
  const parsed = projectSchema.safeParse(input.project);
  if (!parsed.success) return fail(issues(parsed.error));
  const fin = financeSchema.safeParse(input.finance ?? {});
  if (!fin.success) return fail(issues(fin.error));
  const { id: _ignore, ...p } = parsed.data;
  void _ignore;
  const start = p.start_date ?? todayIso();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...p, start_date: start, owner_email: p.owner_email ?? email, template_id: input.template_id || null })
    .select("id, code")
    .single();
  if (error) return fail(error.message);
  const id = data.id as string;
  await supabase.from("project_finance").insert({ project_id: id, ...fin.data });
  const members = [...new Set([...(input.members ?? []), p.owner_email ?? email])];
  if (members.length) await supabase.from("project_members").insert(members.map((m) => ({ project_id: id, member_email: m })));
  if (input.template_id) {
    const { error: tErr } = await supabase.rpc("apply_project_template", { p_project: id, p_template: input.template_id, p_start: start });
    if (tErr) return fail(`Project created, but the template failed: ${tErr.message}`);
    // due date = last templated task, unless one was given
    if (!p.due_date) {
      const { data: last } = await supabase.from("tasks").select("due_date").eq("project_id", id).order("due_date", { ascending: false }).limit(1).maybeSingle();
      if (last?.due_date) await supabase.from("projects").update({ due_date: last.due_date }).eq("id", id);
    }
  }
  await notify(supabase, email, members, { kind: "project_added", title: `You were added to ${p.name}`, link: `/projects/${id}` });
  revalidatePath("/projects");
  return { ok: true, id, code: data.code as string };
}

export async function updateProject(id: string, input: Partial<z.input<typeof projectSchema>>, finance?: z.input<typeof financeSchema>): Promise<Result> {
  const { supabase } = await requireMember("member");
  const parsed = projectSchema.partial().safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { id: _ignore, ...p } = parsed.data;
  void _ignore;
  // drop keys the caller didn't send (zod defaults would overwrite them)
  const patch = Object.fromEntries(Object.entries(p).filter(([k]) => k in input));
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) return fail(error.message);
  }
  if (finance) {
    const f = financeSchema.safeParse(finance);
    if (!f.success) return fail(issues(f.error));
    const { error } = await supabase.from("project_finance").upsert({ project_id: id, ...f.data });
    if (error) return fail(error.message);
  }
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProject(id: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("project_id", id).neq("status", "draft");
  if (count) return fail("This project has issued billing documents. Mark it Done or Cancelled instead.");
  const { count: approvedTime } = await supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("project_id", id).eq("status", "approved");
  if (approvedTime) return fail("This project has approved time. Mark it Done or Cancelled instead.");
  const { data: files } = await supabase.from("files").select("storage_path").eq("project_id", id).eq("kind", "upload");
  const paths = (files ?? []).map((f) => f.storage_path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from("files").remove(paths);
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/projects");
  return { ok: true };
}

export async function setProjectMembers(id: string, emails: string[]): Promise<Result> {
  const { supabase, email: me } = await requireMember("member");
  const want = [...new Set(emails.map((e) => e.toLowerCase()))];
  const { data: cur } = await supabase.from("project_members").select("member_email").eq("project_id", id);
  const have = (cur ?? []).map((m) => m.member_email as string);
  const add = want.filter((e) => !have.includes(e));
  const remove = have.filter((e) => !want.includes(e));
  if (add.length) {
    const { error } = await supabase.from("project_members").insert(add.map((e) => ({ project_id: id, member_email: e })));
    if (error) return fail(error.message);
  }
  if (remove.length) await supabase.from("project_members").delete().eq("project_id", id).in("member_email", remove);
  const { data: p } = await supabase.from("projects").select("name").eq("id", id).single();
  await notify(supabase, me, add, { kind: "project_added", title: `You were added to ${p?.name ?? "a project"}`, link: `/projects/${id}` });
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phases and deliverables (editors)
// ---------------------------------------------------------------------------
export async function savePhase(input: { id?: string; project_id: string; name: string; due_date?: string | null; sort?: number }): Promise<Result> {
  const { supabase } = await requireMember("member");
  const name = input.name.trim();
  if (!name) return fail("Phase name is required");
  const row = { project_id: input.project_id, name, due_date: input.due_date || null, ...(input.sort !== undefined ? { sort: input.sort } : {}) };
  const { error } = input.id ? await supabase.from("phases").update(row).eq("id", input.id) : await supabase.from("phases").insert(row);
  if (error) return fail(error.message);
  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}

export async function deletePhase(id: string, projectId: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("phases").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

const deliverableSchema = z.object({
  id: uuid.optional(),
  project_id: uuid,
  name: z.string().trim().min(1, "Name is required"),
  qty: z.coerce.number().int().min(1).default(1),
  revision_limit: z.coerce.number().int().min(0).default(2),
  status: z.enum(["pending", "in_progress", "delivered"]).default("pending"),
  due_date: date.default(null),
});

export async function saveDeliverable(input: z.input<typeof deliverableSchema>): Promise<Result> {
  const { supabase } = await requireMember("member");
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, ...d } = parsed.data;
  const { error } = id ? await supabase.from("deliverables").update(d).eq("id", id) : await supabase.from("deliverables").insert(d);
  if (error) return fail(error.message);
  revalidatePath(`/projects/${d.project_id}`);
  return { ok: true };
}

export async function deleteDeliverable(id: string, projectId: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("deliverables").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tasks (editors, and freelancers on their projects)
// ---------------------------------------------------------------------------
const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().default(""),
  status: z.enum(["todo", "doing", "review", "client_review", "done"]).default("todo"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  phase_id: uuid.nullable().or(z.literal("").transform(() => null)).default(null),
  parent_id: uuid.nullable().default(null),
  start_date: date.default(null),
  due_date: date.default(null),
  estimate_hours: z.coerce.number().min(0).max(999).default(0),
  labels: z.array(z.string().trim().min(1)).default([]),
  client_visible: z.boolean().default(false),
  sort: z.number().optional(),
});

async function requireWorker() {
  const ctx = await requireTeam();
  if (!ctx.canWork) throw new Error("Viewers can't change tasks");
  return ctx;
}

export async function createTask(projectId: string, input: z.input<typeof taskSchema> & { assignees?: string[] }): Promise<Result<{ id: string }>> {
  const { supabase, email } = await requireWorker();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  let sort = parsed.data.sort;
  if (sort === undefined) {
    const { data: last } = await supabase.from("tasks").select("sort").eq("project_id", projectId).eq("status", parsed.data.status).order("sort", { ascending: false }).limit(1).maybeSingle();
    sort = (last ? Number(last.sort) : 0) + 1;
  }
  const { data, error } = await supabase.from("tasks").insert({ ...parsed.data, sort, project_id: projectId }).select("id").single();
  if (error) return fail(error.message);
  const assignees = input.assignees ?? [];
  if (assignees.length) {
    await supabase.from("task_assignees").insert(assignees.map((e) => ({ task_id: data.id, member_email: e })));
    await notify(supabase, email, assignees, { kind: "task_assigned", title: `New task: ${parsed.data.title}`, link: `/projects/${projectId}?task=${data.id}` });
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: data.id as string };
}

export async function updateTask(id: string, input: Partial<z.input<typeof taskSchema>>): Promise<Result> {
  const { supabase, email } = await requireWorker();
  const parsed = taskSchema.partial().safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k in input));
  const { data: before } = await supabase.from("tasks").select("status, title, project_id, task_assignees(member_email)").eq("id", id).single();
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) return fail(error.message);
  if (before && patch.status && patch.status !== before.status && ["review", "client_review", "done"].includes(patch.status as string)) {
    const { data: p } = await supabase.from("projects").select("owner_email").eq("id", before.project_id).single();
    const watchers = [...((before.task_assignees as { member_email: string }[]) ?? []).map((a) => a.member_email), p?.owner_email ?? ""];
    const label = patch.status === "done" ? "done" : patch.status === "review" ? "ready for review" : "with the client";
    await notify(supabase, email, watchers, { kind: "task_status", title: `${before.title} is ${label}`, link: `/projects/${before.project_id}?task=${id}` });
  }
  if (before) revalidatePath(`/projects/${before.project_id}`);
  revalidatePath("/my-work");
  return { ok: true };
}

/** Board drag-and-drop: one row changes (status + fractional sort key). */
export async function moveTask(id: string, status: string, sort: number): Promise<Result> {
  return updateTask(id, { status: status as z.input<typeof taskSchema>["status"], sort });
}

export async function deleteTask(id: string): Promise<Result> {
  const { supabase } = await requireWorker();
  const { data: t } = await supabase.from("tasks").select("project_id").eq("id", id).single();
  const { data: files } = await supabase.from("files").select("storage_path").eq("task_id", id).eq("kind", "upload");
  const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message);
  if (!count) return fail("Only editors or the person who created it can delete this task.");
  const paths = (files ?? []).map((f) => f.storage_path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from("files").remove(paths);
  if (t) revalidatePath(`/projects/${t.project_id}`);
  return { ok: true };
}

export async function setAssignees(taskId: string, emails: string[]): Promise<Result> {
  const { supabase, email } = await requireWorker();
  const { data: t } = await supabase.from("tasks").select("title, project_id, task_assignees(member_email)").eq("id", taskId).single();
  if (!t) return fail("Task not found");
  const have = ((t.task_assignees as { member_email: string }[]) ?? []).map((a) => a.member_email);
  const add = emails.filter((e) => !have.includes(e));
  const remove = have.filter((e) => !emails.includes(e));
  if (add.length) {
    const { error } = await supabase.from("task_assignees").insert(add.map((e) => ({ task_id: taskId, member_email: e })));
    if (error) return fail(error.message);
    // assignees must be on the project to see it
    if ((await requireTeam()).canEdit) {
      await supabase.from("project_members").upsert(add.map((e) => ({ project_id: t.project_id, member_email: e })), { onConflict: "project_id,member_email", ignoreDuplicates: true });
    }
  }
  if (remove.length) await supabase.from("task_assignees").delete().eq("task_id", taskId).in("member_email", remove);
  await notify(supabase, email, add, { kind: "task_assigned", title: `You were assigned: ${t.title}`, link: `/projects/${t.project_id}?task=${taskId}` });
  revalidatePath(`/projects/${t.project_id}`);
  revalidatePath("/my-work");
  return { ok: true };
}

export async function loadTask(id: string) {
  return getTaskDetail(id);
}

// ---------------------------------------------------------------------------
// Comments and files
// ---------------------------------------------------------------------------
export async function addComment(taskId: string, body: string): Promise<Result> {
  const { supabase, email, role } = await requireTeam();
  if (role === "viewer") return fail("Viewers can't comment");
  const text = body.trim();
  if (!text) return fail("Write something first");
  if (text.length > 5000) return fail("Comment is too long");
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, body: text });
  if (error) return fail(error.message);
  const { data: t } = await supabase.from("tasks").select("title, project_id, task_assignees(member_email)").eq("id", taskId).single();
  if (t) {
    const { data: people } = await supabase.rpc("team_directory");
    const mentioned = mentionedEmails(text, (people ?? []) as Person[]);
    const link = `/projects/${t.project_id}?task=${taskId}`;
    await notify(supabase, email, mentioned, { kind: "mention", title: `Mentioned on ${t.title}`, body: text.slice(0, 200), link });
    const assignees = ((t.task_assignees as { member_email: string }[]) ?? []).map((a) => a.member_email).filter((e) => !mentioned.includes(e));
    await notify(supabase, email, assignees, { kind: "comment", title: `New comment on ${t.title}`, body: text.slice(0, 200), link });
    revalidatePath(`/projects/${t.project_id}`);
  }
  return { ok: true };
}

export async function deleteComment(id: string): Promise<Result> {
  const { supabase } = await requireTeam();
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  if (error) return fail(error.message);
  return { ok: true };
}

const linkSchema = z.object({
  project_id: uuid.nullable(),
  task_id: uuid.nullable().default(null),
  name: z.string().trim().min(1, "Name is required"),
  url: z.string().trim().url("Paste a full link starting with https://").refine((u) => /^https?:\/\//.test(u), "Links must start with https://"),
});

export async function addLink(input: z.input<typeof linkSchema>): Promise<Result> {
  const { supabase } = await requireWorker();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { error } = await supabase.from("files").insert({ ...parsed.data, kind: "link" });
  if (error) return fail(error.message);
  if (parsed.data.project_id) revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

/** Records a file the browser already uploaded straight to Storage (Vercel bodies cap at 4.5 MB). */
export async function registerUpload(input: { project_id: string; task_id?: string | null; storage_path: string; name: string; size: number; mime: string }): Promise<Result> {
  const { supabase } = await requireWorker();
  if (!input.storage_path.startsWith(`projects/${input.project_id}/`)) return fail("Bad upload path");
  const { error } = await supabase.from("files").insert({
    project_id: input.project_id,
    task_id: input.task_id ?? null,
    kind: "upload",
    storage_path: input.storage_path,
    name: input.name.slice(0, 200),
    size: input.size,
    mime: input.mime,
  });
  if (error) {
    await supabase.storage.from("files").remove([input.storage_path]);
    return fail(error.message);
  }
  revalidatePath(`/projects/${input.project_id}`);
  return { ok: true };
}

export async function deleteFile(id: string): Promise<Result> {
  const { supabase } = await requireWorker();
  const { data: f } = await supabase.from("files").select("storage_path, project_id").eq("id", id).single();
  const { error, count } = await supabase.from("files").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message);
  if (!count) return fail("Only editors or the uploader can delete this file.");
  if (f?.storage_path) await supabase.storage.from("files").remove([f.storage_path]);
  if (f?.project_id) revalidatePath(`/projects/${f.project_id}`);
  return { ok: true };
}

/** Short-lived download link (bucket is private). */
export async function fileUrl(id: string): Promise<Result<{ url: string }>> {
  const { supabase } = await requireTeam();
  const { data: f } = await supabase.from("files").select("kind, url, storage_path, name").eq("id", id).single();
  if (!f) return fail("File not found");
  if (f.kind === "link") return { ok: true, url: f.url as string };
  const { data, error } = await supabase.storage.from("files").createSignedUrl(f.storage_path as string, 300, { download: f.name as string });
  if (error || !data) return fail(error?.message ?? "Couldn't create a download link");
  return { ok: true, url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function markNotificationsRead(ids?: number[]): Promise<Result> {
  const { supabase, email } = await requireTeam();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_email", email).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return fail(error.message);
  return { ok: true };
}

export async function fetchNotifications() {
  const { listNotifications } = await import("@/lib/pm-data");
  return listNotifications();
}
