"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSettings, requireMember, requireTeam } from "@/lib/data";
import { OUTSIDE_INDIA, autoGstMode } from "@/lib/gst";
import { addDays, todayIso } from "@/lib/money";
import { invoiceLinesFromTime, timerMinutes, weekDays } from "@/lib/time";
import { saveDocument } from "./documents";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function worker() {
  const ctx = await requireTeam();
  if (!ctx.canWork) throw new Error("Viewers can't log time");
  return ctx;
}

function refresh(projectId?: string | null) {
  revalidatePath("/time");
  revalidatePath("/my-work");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------
async function stopRunning(supabase: Awaited<ReturnType<typeof requireTeam>>["supabase"], email: string) {
  const { data: running } = await supabase.from("time_entries").select("id, timer_started_at, project_id").eq("member_email", email).not("timer_started_at", "is", null).maybeSingle();
  if (!running) return null;
  const minutes = timerMinutes(running.timer_started_at as string);
  const { error } = await supabase.from("time_entries").update({ minutes, timer_started_at: null }).eq("id", running.id);
  if (error) throw new Error(error.message);
  return { id: running.id as string, minutes, project_id: running.project_id as string };
}

export async function startTimer(input: { project_id: string; task_id?: string | null; note?: string }): Promise<Result> {
  const { supabase, email } = await worker();
  if (!uuid.safeParse(input.project_id).success) return fail("Pick a project");
  try {
    await stopRunning(supabase, email);
  } catch (e) {
    return fail((e as Error).message);
  }
  const { error } = await supabase.from("time_entries").insert({
    project_id: input.project_id,
    task_id: input.task_id || null,
    work_date: todayIso(),
    minutes: 0,
    note: input.note ?? "",
    timer_started_at: new Date().toISOString(),
  });
  if (error) return fail(error.code === "23505" ? "A timer is already running." : error.message);
  refresh(input.project_id);
  return { ok: true };
}

export async function stopTimer(): Promise<Result<{ minutes: number }>> {
  const { supabase, email } = await worker();
  try {
    const stopped = await stopRunning(supabase, email);
    refresh(stopped?.project_id);
    return { ok: true, minutes: stopped?.minutes ?? 0 };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Timesheet
// ---------------------------------------------------------------------------
/** One timesheet cell: my draft time for (project, task, day). 0 deletes it. */
export async function setCell(input: { project_id: string; task_id: string | null; work_date: string; minutes: number }): Promise<Result> {
  const { supabase, email } = await worker();
  if (!uuid.safeParse(input.project_id).success || !isoDate.safeParse(input.work_date).success) return fail("Bad cell");
  if (!(input.minutes >= 0 && input.minutes <= 1440)) return fail("A day has 24 hours");
  let q = supabase
    .from("time_entries")
    .select("id, minutes, status")
    .eq("member_email", email)
    .eq("project_id", input.project_id)
    .eq("work_date", input.work_date)
    .is("timer_started_at", null)
    .in("status", ["draft", "rejected"]);
  q = input.task_id ? q.eq("task_id", input.task_id) : q.is("task_id", null);
  const { data: rows } = await q.order("created_at");
  const [first, ...extra] = rows ?? [];
  if (extra.length) await supabase.from("time_entries").delete().in("id", extra.map((r) => r.id));
  let error;
  if (input.minutes === 0) {
    if (first) ({ error } = await supabase.from("time_entries").delete().eq("id", first.id));
  } else if (first) {
    ({ error } = await supabase.from("time_entries").update({ minutes: input.minutes, status: "draft" }).eq("id", first.id));
  } else {
    ({ error } = await supabase.from("time_entries").insert({ project_id: input.project_id, task_id: input.task_id, work_date: input.work_date, minutes: input.minutes }));
  }
  if (error) return fail(error.message);
  revalidatePath("/time");
  return { ok: true };
}

const entrySchema = z.object({
  id: uuid.optional(),
  project_id: uuid,
  task_id: uuid.nullable().or(z.literal("").transform(() => null)).default(null),
  work_date: isoDate,
  minutes: z.number().int().min(1, "Enter some time").max(1440),
  billable: z.boolean().default(true),
  note: z.string().trim().max(500).default(""),
});

export async function saveEntry(input: z.input<typeof entrySchema>): Promise<Result> {
  const { supabase } = await worker();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(", "));
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await supabase.from("time_entries").update({ ...row, status: "draft" }).eq("id", id)
    : await supabase.from("time_entries").insert(row);
  if (error) return fail(error.message);
  refresh(row.project_id);
  return { ok: true };
}

export async function deleteEntry(id: string): Promise<Result> {
  const { supabase } = await worker();
  const { error, count } = await supabase.from("time_entries").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message.replace(/^.*?: /, ""));
  if (!count) return fail("Only draft time can be deleted.");
  refresh();
  return { ok: true };
}

/** Sends my draft time for the week (Mon–Sun) for approval. */
export async function submitWeek(monday: string): Promise<Result<{ count: number }>> {
  const { supabase, email } = await worker();
  const days = weekDays(monday);
  const { data, error } = await supabase
    .from("time_entries")
    .update({ status: "submitted" })
    .eq("member_email", email)
    .in("status", ["draft", "rejected"])
    .is("timer_started_at", null)
    .gt("minutes", 0)
    .gte("work_date", days[0])
    .lte("work_date", days[6])
    .select("id");
  if (error) return fail(error.message);
  const n = data?.length ?? 0;
  if (n) {
    const { data: admins } = await supabase.rpc("team_directory");
    const admin = ((admins ?? []) as { email: string; role: string }[]).find((p) => p.role === "admin");
    if (admin && admin.email !== email) {
      await supabase.from("notifications").insert({ recipient_email: admin.email, kind: "time_submitted", title: `${email.split("@")[0]} submitted time for the week of ${monday}`, link: "/time?tab=approve" });
    }
  }
  revalidatePath("/time");
  return { ok: true, count: n };
}

/** Admin: approve or send back submitted entries. */
export async function decideTime(ids: string[], approve: boolean, reason = ""): Promise<Result<{ count: number }>> {
  const { supabase } = await requireMember("admin");
  if (!ids.length) return fail("Nothing selected");
  const { data, error } = await supabase
    .from("time_entries")
    .update({ status: approve ? "approved" : "rejected" })
    .in("id", ids)
    .eq("status", "submitted")
    .select("member_email, work_date");
  if (error) return fail(error.message);
  const people = [...new Set((data ?? []).map((r) => r.member_email as string))];
  if (!approve && people.length) {
    await supabase.from("notifications").insert(
      people.map((p) => ({ recipient_email: p, kind: "time_rejected", title: "Some of your time was sent back", body: reason, link: "/time" })),
    );
  }
  revalidatePath("/time");
  return { ok: true, count: data?.length ?? 0 };
}

/** Admin: cost rate (₹/h, private), bill rate and weekly capacity. */
export async function setRates(email: string, cost: number, bill: number, capacity: number): Promise<Result> {
  const { supabase } = await requireMember("admin");
  if ([cost, bill].some((n) => !(n >= 0)) || !(capacity >= 0 && capacity <= 80)) return fail("Rates must be ≥ 0 and capacity 0–80 h");
  const { error } = await supabase.rpc("admin_set_rates", { p_email: email, p_cost: cost, p_bill: bill, p_capacity: capacity });
  if (error) return fail(error.message);
  revalidatePath("/team");
  revalidatePath("/team/workload");
  return { ok: true };
}

/** Drafts a GST invoice from a project's approved, billable, not-yet-invoiced time. */
export async function invoiceFromTime(projectId: string): Promise<Result<{ id: string; hours: number }>> {
  const { supabase } = await requireMember("member");
  const [{ data: project }, { data: fin }, { data: entries }, settings] = await Promise.all([
    supabase.from("projects").select("id, name, code, client_id").eq("id", projectId).single(),
    supabase.from("project_finance").select("hourly_rate").eq("project_id", projectId).maybeSingle(),
    supabase.from("time_entries").select("id, minutes, billable, status, invoiced_document_id, task_id, timer_started_at, tasks(title)").eq("project_id", projectId).eq("status", "approved").eq("billable", true).is("invoiced_document_id", null),
    getSettings(),
  ]);
  if (!project) return fail("Project not found");
  if (!project.client_id) return fail("Pick a client for this project first (Overview → Edit).");
  const rate = Number(fin?.hourly_rate ?? 0);
  if (!rate) return fail("Set an hourly rate on the project first (Overview → Budget).");
  const rows = (entries ?? []).map((e) => ({ ...e, minutes: Number(e.minutes), task_title: (e.tasks as { title?: string } | null)?.title }));
  const items = invoiceLinesFromTime(rows as never, rate, project.name as string, settings.default_sac);
  if (!items.length) return fail("No approved, billable time left to invoice.");

  const { data: client } = await supabase.from("clients").select("*").eq("id", project.client_id).single();
  if (!client) return fail("Client not found");
  const abroad = client.country !== "India";
  const place = abroad ? OUTSIDE_INDIA : client.state_code || settings.state_code;
  const exportType = abroad ? (settings.lut_number ? "lut" : "igst") : "none";
  const today = todayIso();
  const res = await saveDocument({
    doc_type: "invoice",
    number: null,
    client_id: client.id,
    client: { name: client.name, email: client.email, phone: client.phone, address: client.address, city: client.city, pin: client.pin, state_code: client.state_code, country: client.country, gstin: client.gstin },
    bank_account_id: null,
    project_id: projectId,
    source_id: null,
    source_relation: null,
    issue_date: today,
    due_date: addDays(today, settings.default_due_days),
    valid_until: null,
    currency: "INR",
    fx_rate: 1,
    place_of_supply: place,
    reverse_charge: false,
    export_type: exportType,
    gst_mode: autoGstMode(settings.state_code, place, exportType),
    gst_rate: settings.default_gst_rate,
    discount_type: "none",
    discount_value: 0,
    round_off: true,
    notes: `Time for ${project.code} · ${project.name}.`,
    terms: settings.terms.invoice ?? "",
    payment_terms: settings.default_due_days === 0 ? "Due on receipt" : `Net ${settings.default_due_days}`,
    custom_fields: [],
    reminders_enabled: true,
    recurring: null,
    items,
  });
  if (!res.ok) return fail(res.message);
  const ids = rows.filter((r) => !r.timer_started_at).map((r) => r.id as string);
  const { error } = await supabase.from("time_entries").update({ invoiced_document_id: res.id }).in("id", ids);
  if (error) return fail(`Invoice drafted, but linking the time failed: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, id: res.id, hours: Math.round((rows.reduce((s, r) => s + r.minutes, 0) / 60) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Leave and holidays
// ---------------------------------------------------------------------------
const leaveSchema = z.object({
  from_date: isoDate,
  to_date: isoDate,
  half_day: z.boolean().default(false),
  kind: z.enum(["casual", "sick", "unpaid", "other"]).default("casual"),
  note: z.string().trim().max(300).default(""),
});

export async function requestLeave(input: z.input<typeof leaveSchema>): Promise<Result> {
  const { supabase, email } = await requireTeam();
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) return fail("Check the dates");
  const l = parsed.data;
  if (l.to_date < l.from_date) return fail("The end date is before the start date");
  if (l.half_day && l.from_date !== l.to_date) return fail("A half day is a single day");
  const { error } = await supabase.from("leave_requests").insert(l);
  if (error) return fail(error.message);
  const { data: people } = await supabase.rpc("team_directory");
  const admin = ((people ?? []) as { email: string; role: string }[]).find((p) => p.role === "admin");
  if (admin && admin.email !== email) {
    await supabase.from("notifications").insert({ recipient_email: admin.email, kind: "leave_requested", title: `${email.split("@")[0]} asked for leave`, body: `${l.from_date} → ${l.to_date}${l.note ? ` · ${l.note}` : ""}`, link: "/team/leave" });
  }
  revalidatePath("/team/leave");
  return { ok: true };
}

export async function decideLeave(id: string, approve: boolean): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { data, error } = await supabase.from("leave_requests").update({ status: approve ? "approved" : "declined" }).eq("id", id).select("member_email, from_date, to_date").single();
  if (error) return fail(error.message);
  await supabase.from("notifications").insert({ recipient_email: data.member_email, kind: "leave_decided", title: `Leave ${approve ? "approved" : "declined"}: ${data.from_date} → ${data.to_date}`, link: "/team/leave" });
  revalidatePath("/team/leave");
  revalidatePath("/team/workload");
  return { ok: true };
}

export async function cancelLeave(id: string): Promise<Result> {
  const { supabase } = await requireTeam();
  const { error, count } = await supabase.from("leave_requests").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message);
  if (!count) return fail("Only pending requests can be withdrawn.");
  revalidatePath("/team/leave");
  return { ok: true };
}

export async function saveHoliday(day: string, name: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  if (!isoDate.safeParse(day).success || !name.trim()) return fail("Date and name are required");
  const { error } = await supabase.from("holidays").upsert({ day, name: name.trim() });
  if (error) return fail(error.message);
  revalidatePath("/team/leave");
  return { ok: true };
}

export async function deleteHoliday(day: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("holidays").delete().eq("day", day);
  if (error) return fail(error.message);
  revalidatePath("/team/leave");
  return { ok: true };
}
