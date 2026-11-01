"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toIcs } from "@/lib/calendar";
import { DEFAULT_BOOKING, OPEN_STAGES, STAGE_LABEL, freeSlots, slugify, type BookingSettings, type Stage } from "@/lib/crm";
import { requireMember } from "@/lib/data";
import { sendMail } from "@/lib/mail";
import { addDays, todayIso } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "./auth";
import { createProject } from "./projects";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });
const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(", ");
const uuid = z.string().uuid();
const stageEnum = z.enum(["enquiry", "discovery", "proposal", "negotiation", "won", "lost"]);
const sourceEnum = z.enum(["website", "instagram", "referral", "whatsapp", "email", "event", "repeat", "other"]);

function refresh(id?: string) {
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/${id}`);
}

// ---------------------------------------------------------------------------
// Leads (staff)
// ---------------------------------------------------------------------------
const leadSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  company: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  city: z.string().trim().max(80).default(""),
  source: sourceEnum.default("other"),
  service: z.string().trim().max(120).default(""),
  budget: z.string().trim().max(80).default(""),
  value: z.coerce.number().min(0).default(0),
  stage: stageEnum.default("enquiry"),
  owner_email: z
    .string()
    .email()
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  follow_up_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  message: z.string().trim().max(5000).default(""),
  notes: z.string().trim().max(5000).default(""),
});

export async function saveLead(input: z.input<typeof leadSchema>): Promise<Result<{ id: string }>> {
  const { supabase, email } = await requireMember("member");
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, ...l } = parsed.data;
  if (l.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email)) return fail("That email doesn't look right");
  const { data, error } = id
    ? await supabase.from("leads").update(l).eq("id", id).select("id").single()
    : await supabase
        .from("leads")
        .insert({ ...l, owner_email: l.owner_email ?? email, created_by: email })
        .select("id")
        .single();
  if (error) return fail(error.message);
  if (!id) await supabase.from("lead_activities").insert({ lead_id: data.id, kind: "system", body: "Lead added" });
  refresh(data.id as string);
  return { ok: true, id: data.id as string };
}

/** Board drag-and-drop or the stage picker. Lost needs a reason. */
export async function moveLead(id: string, stage: Stage, sort?: number, lostReason = ""): Promise<Result> {
  const { supabase } = await requireMember("member");
  if (!stageEnum.safeParse(stage).success) return fail("Unknown stage");
  const { data: before } = await supabase.from("leads").select("stage").eq("id", id).single();
  if (stage === "lost" && !lostReason.trim() && before?.stage !== "lost") return fail("Pick why it was lost");
  const patch: Record<string, unknown> = { stage };
  if (sort !== undefined) patch.sort = sort;
  if (stage === "lost" && lostReason) patch.lost_reason = lostReason;
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) return fail(error.message);
  if (before && before.stage !== stage) {
    await supabase
      .from("lead_activities")
      .insert({ lead_id: id, kind: "stage", body: `${STAGE_LABEL[before.stage as Stage]} → ${STAGE_LABEL[stage]}${stage === "lost" && lostReason ? ` (${lostReason})` : ""}` });
  }
  refresh(id);
  return { ok: true };
}

export async function addActivity(leadId: string, kind: string, body: string, followUp?: string | null): Promise<Result> {
  const { supabase } = await requireMember("member");
  if (!["note", "call", "email", "meeting", "whatsapp"].includes(kind)) return fail("Unknown activity");
  if (!body.trim() && followUp === undefined) return fail("Write something first");
  if (body.trim()) {
    const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, kind, body: body.trim().slice(0, 5000) });
    if (error) return fail(error.message);
  }
  if (followUp !== undefined)
    await supabase
      .from("leads")
      .update({ follow_up_on: followUp || null })
      .eq("id", leadId);
  refresh(leadId);
  return { ok: true };
}

export async function deleteLead(id: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/**
 * Won: makes (or finds, by email) the client, optionally a project from a template, and marks
 * the lead won. The quote is then one click away with the client filled in.
 */
export async function convertLead(
  id: string,
  opts: { template_id?: string | null; project_name?: string; create_project: boolean },
): Promise<Result<{ client_id: string; project_id: string | null }>> {
  const { supabase, email } = await requireMember("member");
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) return fail("Lead not found");
  let clientId = lead.client_id as string | null;
  if (!clientId && lead.email) {
    const { data: existing } = await supabase.from("clients").select("id").ilike("email", lead.email).limit(1).maybeSingle();
    clientId = (existing?.id as string) ?? null;
  }
  if (!clientId) {
    const { data: c, error } = await supabase
      .from("clients")
      .insert({
        name: (lead.company as string) || (lead.name as string),
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        notes: `From lead: ${lead.name}${lead.message ? `\n\n${lead.message}` : ""}`,
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    clientId = c.id as string;
  }
  let projectId = lead.project_id as string | null;
  if (opts.create_project && !projectId) {
    const r = await createProject({
      project: {
        name: opts.project_name?.trim() || `${(lead.company as string) || (lead.name as string)} · ${(lead.service as string) || "project"}`,
        client_id: clientId,
        status: "active",
      },
      finance: { budget: Number(lead.value) || 0 },
      template_id: opts.template_id || null,
      members: [email],
    });
    if (!r.ok) return fail(`Client created, but the project failed: ${r.message}`);
    projectId = r.id;
  }
  const { error } = await supabase.from("leads").update({ stage: "won", client_id: clientId, project_id: projectId }).eq("id", id);
  if (error) return fail(error.message);
  await supabase.from("lead_activities").insert({ lead_id: id, kind: "stage", body: `Won → client${projectId ? " and project" : ""} created` });
  refresh(id);
  revalidatePath("/clients");
  return { ok: true, client_id: clientId, project_id: projectId };
}

// ---------------------------------------------------------------------------
// Settings: booking page and enquiry form (admin)
// ---------------------------------------------------------------------------
export async function saveBooking(b: BookingSettings, services: string[]): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const clean: BookingSettings = {
    ...DEFAULT_BOOKING,
    ...b,
    slug: slugify(b.slug || "kora-kaagaz"),
    minutes: Math.min(240, Math.max(15, Math.round(b.minutes))),
    buffer: Math.min(120, Math.max(0, Math.round(b.buffer))),
    notice_hours: Math.min(168, Math.max(0, Math.round(b.notice_hours))),
    horizon_days: Math.min(90, Math.max(1, Math.round(b.horizon_days))),
    days: [...new Set(b.days.filter((d) => d >= 0 && d <= 6))].sort(),
  };
  if (!/^\d{2}:\d{2}$/.test(clean.start) || !/^\d{2}:\d{2}$/.test(clean.end) || clean.start >= clean.end) return fail("Working hours: start must be before end");
  const { error } = await supabase
    .from("settings")
    .update({
      booking: clean,
      enquiry_services: services
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20),
    })
    .eq("id", 1);
  if (error) return fail(error.message);
  revalidatePath("/crm/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public: enquiry form and booking page (no login; service-role writes, strictly validated)
// ---------------------------------------------------------------------------
async function ipHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256")
    .update(`${ip}|${process.env.CRON_SECRET ?? "kk"}`)
    .digest("hex")
    .slice(0, 32);
}

async function tellTheStudio(db: ReturnType<typeof createAdminClient>, title: string, body: string, link: string) {
  const { data: staff } = await db.from("members").select("email").in("role", ["admin", "member"]);
  const admin = (staff ?? [])[0]?.email as string | undefined;
  if (staff?.length)
    await db.from("notifications").insert(staff.map((s) => ({ recipient_email: s.email, actor_email: admin ?? s.email, kind: "lead", title, body: body.slice(0, 300), link })));
  await sendMail({ to: [process.env.SMTP_USER || "team@korakaagaz.co"], subject: title, text: `${body}\n\n${await siteUrl()}${link}` });
}

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name").max(120),
  email: z.string().trim().email("Please check your email").max(200),
  phone: z.string().trim().max(30).default(""),
  company: z.string().trim().max(160).default(""),
  service: z.string().trim().max(120).default(""),
  budget: z.string().trim().max(80).default(""),
  message: z.string().trim().min(5, "Tell us a little about the project").max(4000),
  source: z.string().trim().max(30).default("website"),
  // spam traps: a hidden field bots fill, and how long the form was open
  website: z.string().max(500).default(""),
  opened_at: z.coerce.number().default(0),
});

export async function submitEnquiry(input: z.input<typeof enquirySchema>): Promise<Result> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const e = parsed.data;
  // filled in faster than a person can type, or the hidden field is filled: pretend it worked
  if (e.website || (e.opened_at && Date.now() - e.opened_at < 3000)) return { ok: true };
  const db = createAdminClient();
  const hash = await ipHash();
  const { count } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((count ?? 0) >= 5) return fail("Thanks! We've already got a few messages from you. We'll be in touch soon.");
  const source = sourceEnum.safeParse(e.source).success ? e.source : "website";
  const { data: admin } = await db.from("members").select("email").eq("role", "admin").maybeSingle();
  const { data, error } = await db
    .from("leads")
    .insert({
      name: e.name,
      email: e.email,
      phone: e.phone,
      company: e.company,
      service: e.service,
      budget: e.budget,
      message: e.message,
      source,
      ip_hash: hash,
      owner_email: admin?.email ?? null,
      follow_up_on: addDays(todayIso(), 1),
      created_by: "enquiry form",
    })
    .select("id")
    .single();
  if (error) return fail("Something went wrong. Please email team@korakaagaz.co instead.");
  await db.from("lead_activities").insert({ lead_id: data.id, kind: "system", body: "Came in through the enquiry form", author_email: "enquiry form" });
  await tellTheStudio(
    db,
    `New enquiry: ${e.name}${e.company ? ` (${e.company})` : ""}`,
    `${e.service ? `${e.service} · ` : ""}${e.budget ? `${e.budget} · ` : ""}${e.email}${e.phone ? ` · ${e.phone}` : ""}\n\n${e.message}`,
    `/crm/${data.id}`,
  );
  return { ok: true };
}

/** Busy times for the booking page: confirmed and tentative events of the people who take calls. */
async function busyTimes(db: ReturnType<typeof createAdminClient>, from: string, to: string) {
  const { data } = await db.from("events").select("starts_at, ends_at, status").neq("status", "cancelled").lt("starts_at", to).gt("ends_at", from);
  return (data ?? []) as { starts_at: string; ends_at: string }[];
}

export async function bookingSlots(slug: string) {
  const db = createAdminClient();
  const { data: s } = await db.from("settings").select("booking, business_name").eq("id", 1).single();
  const b: BookingSettings = { ...DEFAULT_BOOKING, ...((s?.booking as BookingSettings) ?? {}) };
  if (!b.enabled || b.slug !== slug) return null;
  const now = new Date();
  const until = new Date(now.getTime() + (b.horizon_days + 1) * 86400000).toISOString();
  const [busy, { data: hol }] = await Promise.all([busyTimes(db, now.toISOString(), until), db.from("holidays").select("day")]);
  return {
    booking: b,
    business: (s?.business_name as string) || "Kora Kaagaz",
    days: freeSlots(
      b,
      busy,
      now,
      (hol ?? []).map((h) => h.day as string),
    ),
  };
}

const bookSchema = z.object({
  slug: z.string(),
  slot: z.string().datetime(),
  name: z.string().trim().min(2, "Please tell us your name").max(120),
  email: z.string().trim().email("Please check your email").max(200),
  phone: z.string().trim().max(30).default(""),
  company: z.string().trim().max(160).default(""),
  note: z.string().trim().max(2000).default(""),
  website: z.string().max(500).default(""),
});

export async function bookCall(input: z.input<typeof bookSchema>): Promise<Result<{ when: string }>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const b = parsed.data;
  if (b.website) return fail("Please try again.");
  const available = await bookingSlots(b.slug);
  if (!available) return fail("Booking is closed right now.");
  const slotIso = new Date(b.slot).toISOString();
  if (!available.days.some((d) => d.slots.includes(slotIso))) return fail("That time was just taken. Please pick another.");
  const db = createAdminClient();
  const hash = await ipHash();
  const { count } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", hash)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if ((count ?? 0) >= 5) return fail("Too many requests from here. Please email team@korakaagaz.co.");

  const minutes = available.booking.minutes;
  const end = new Date(Date.parse(slotIso) + minutes * 60000).toISOString();
  const { data: admin } = await db.from("members").select("email").eq("role", "admin").maybeSingle();
  // reuse an open lead with the same email, else start one at "Discovery call"
  const { data: existing } = await db.from("leads").select("id, stage").ilike("email", b.email).in("stage", OPEN_STAGES).limit(1).maybeSingle();
  let leadId = existing?.id as string | undefined;
  if (leadId) {
    if (existing!.stage === "enquiry") await db.from("leads").update({ stage: "discovery" }).eq("id", leadId);
  } else {
    const { data: l, error } = await db
      .from("leads")
      .insert({
        name: b.name,
        email: b.email,
        phone: b.phone,
        company: b.company,
        message: b.note,
        stage: "discovery",
        source: "website",
        ip_hash: hash,
        owner_email: admin?.email ?? null,
        created_by: "booking page",
      })
      .select("id")
      .single();
    if (error) return fail("Something went wrong. Please email team@korakaagaz.co instead.");
    leadId = l.id as string;
  }
  const title = `${available.booking.title}: ${b.name}${b.company ? ` (${b.company})` : ""}`;
  const { data: ev, error: evErr } = await db
    .from("events")
    .insert({
      type: "meeting",
      title,
      starts_at: slotIso,
      ends_at: end,
      location: available.booking.location,
      status: "confirmed",
      notes: `${b.email}${b.phone ? ` · ${b.phone}` : ""}\n${b.note}`,
      contacts: `${b.name} · ${b.email}${b.phone ? ` · ${b.phone}` : ""}`,
    })
    .select("id")
    .single();
  if (evErr) return fail("Something went wrong. Please email team@korakaagaz.co instead.");
  const people = [{ event_id: ev.id, external_name: b.name, role: "Client", phone: b.phone }, ...(admin ? [{ event_id: ev.id, member_email: admin.email, role: "Host" }] : [])];
  await db.from("event_people").insert(people);
  const when = new Date(slotIso).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" });
  await db
    .from("lead_activities")
    .insert({ lead_id: leadId, kind: "meeting", body: `Booked a ${available.booking.title.toLowerCase()} for ${when}`, author_email: "booking page" });
  const ics = toIcs(available.booking.title, [
    {
      uid: `event-${ev.id}`,
      title: `${available.booking.title} with ${available.business}`,
      start: slotIso,
      end,
      allDay: false,
      location: available.booking.location,
      description: b.note,
    },
  ]);
  await sendMail({
    to: [b.email],
    subject: `Booked: ${available.booking.title} with ${available.business}, ${when}`,
    text: `Hi ${b.name},\n\nYou're booked for a ${minutes}-minute ${available.booking.title.toLowerCase()} on ${when} (India time).\nWhere: ${available.booking.location}\n\nThe calendar invite is attached. Need to change it? Just reply to this email.\n\n${available.business}`,
    attachments: [{ filename: "invite.ics", content: Buffer.from(ics), contentType: "text/calendar" }],
  });
  await tellTheStudio(db, `Call booked: ${b.name}, ${when}`, `${b.email}${b.phone ? ` · ${b.phone}` : ""}${b.note ? `\n\n${b.note}` : ""}`, `/crm/${leadId}`);
  return { ok: true, when };
}
