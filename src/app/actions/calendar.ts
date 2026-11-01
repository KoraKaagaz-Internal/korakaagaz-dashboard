"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findConflicts, istDate, type Conflict } from "@/lib/calendar";
import { requireMember, requireTeam } from "@/lib/data";
import { addDays } from "@/lib/money";
import { listEvents } from "@/lib/time-data";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });
const uuid = z.string().uuid();

const eventSchema = z.object({
  id: uuid.optional(),
  type: z.enum(["shoot", "meeting", "deadline", "other"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  project_id: uuid
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  all_day: z.boolean().default(false),
  location: z.string().trim().max(300).default(""),
  map_url: z
    .string()
    .trim()
    .refine((u) => u === "" || /^https?:\/\//.test(u), "Map link must start with https://")
    .default(""),
  status: z.enum(["tentative", "confirmed", "cancelled"]).default("confirmed"),
  call_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  notes: z.string().max(5000).default(""),
  shot_list: z.string().max(10000).default(""),
  contacts: z.string().max(2000).default(""),
  people: z
    .array(
      z.object({
        member_email: z.string().email().nullable(),
        external_name: z.string().trim().default(""),
        role: z.string().trim().default(""),
        phone: z.string().trim().default(""),
      }),
    )
    .default([]),
  kit: z.array(uuid).default([]),
});
export type EventInput = z.input<typeof eventSchema>;

/** Double bookings for people/kit around this event's time. */
export async function checkConflicts(input: Pick<EventInput, "id" | "starts_at" | "ends_at" | "status" | "type"> & { people: string[]; kit: string[] }): Promise<Conflict[]> {
  await requireTeam();
  if (!input.starts_at || !input.ends_at || input.ends_at < input.starts_at) return [];
  const from = addDays(istDate(input.starts_at), -1);
  const to = addDays(istDate(input.ends_at), 1);
  const events = await listEvents(from, to);
  return findConflicts(
    { id: input.id ?? "", starts_at: input.starts_at, ends_at: input.ends_at, status: input.status ?? "confirmed", type: input.type, people: input.people, kit: input.kit },
    events.map((e) => ({ ...e, people: e.people.map((p) => p.member_email).filter(Boolean) as string[] })),
  );
}

export async function saveEvent(input: EventInput): Promise<Result<{ id: string; conflicts: Conflict[] }>> {
  const { supabase, email } = await requireMember("member");
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(", "));
  const { id, people, kit, ...e } = parsed.data;
  if (e.ends_at < e.starts_at) return fail("It ends before it starts");
  const { data, error } = id ? await supabase.from("events").update(e).eq("id", id).select("id").single() : await supabase.from("events").insert(e).select("id").single();
  if (error) return fail(error.message);
  const eventId = data.id as string;

  const { data: before } = await supabase.from("event_people").select("member_email").eq("event_id", eventId);
  await supabase.from("event_people").delete().eq("event_id", eventId);
  const crew = people.filter((p) => p.member_email || p.external_name);
  const seen = new Set<string>();
  const rows = crew.filter((p) => !p.member_email || (!seen.has(p.member_email) && seen.add(p.member_email)));
  if (rows.length) {
    const { error: pErr } = await supabase.from("event_people").insert(rows.map((p) => ({ ...p, event_id: eventId })));
    if (pErr) return fail(pErr.message);
  }
  await supabase.from("event_kit").delete().eq("event_id", eventId);
  if (kit.length) {
    const { error: kErr } = await supabase.from("event_kit").insert([...new Set(kit)].map((k) => ({ event_id: eventId, kit_id: k })));
    if (kErr) return fail(kErr.message);
  }

  // tell newly booked team members
  const had = new Set((before ?? []).map((b) => b.member_email as string));
  const added = rows.map((r) => r.member_email).filter((m): m is string => !!m && !had.has(m) && m !== email);
  if (added.length) {
    const when = new Date(e.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: e.all_day ? undefined : "short", timeZone: "Asia/Kolkata" });
    await supabase.from("notifications").insert(
      added.map((m) => ({
        recipient_email: m,
        kind: "booked",
        title: `Booked: ${e.title}`,
        body: `${when}${e.location ? ` · ${e.location}` : ""}${e.status === "tentative" ? " (tentative)" : ""}`,
        link: `/calendar/${eventId}`,
      })),
    );
  }

  const conflicts = await checkConflicts({
    id: eventId,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    status: e.status,
    type: e.type,
    people: rows.map((r) => r.member_email).filter(Boolean) as string[],
    kit,
  });
  revalidatePath("/calendar");
  if (e.project_id) revalidatePath(`/projects/${e.project_id}`);
  return { ok: true, id: eventId, conflicts };
}

export async function deleteEvent(id: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/calendar");
  return { ok: true };
}

const kitSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().max(60).default(""),
  serial: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
});

export async function saveKit(input: z.input<typeof kitSchema>): Promise<Result> {
  const { supabase } = await requireMember("member");
  const parsed = kitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(", "));
  const { id, ...k } = parsed.data;
  const { error } = id ? await supabase.from("kit").update(k).eq("id", id) : await supabase.from("kit").insert(k);
  if (error) return fail(error.message);
  revalidatePath("/calendar/kit");
  return { ok: true };
}

export async function deleteKit(id: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("kit").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/calendar/kit");
  return { ok: true };
}

/** My private calendar feed URL (optionally with a fresh token, which breaks the old URL). */
export async function myFeedToken(rotate = false): Promise<Result<{ token: string }>> {
  const { supabase } = await requireTeam();
  const { data, error } = await supabase.rpc("my_ics_token", { p_rotate: rotate });
  if (error || !data) return fail(error?.message ?? "No token");
  return { ok: true, token: data as string };
}
