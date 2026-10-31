// CRM (pure): stages, sources, booking slots, pipeline maths.
import { addDays, daysBetween, round2 } from "./money";

export type Stage = "enquiry" | "discovery" | "proposal" | "negotiation" | "won" | "lost";
export type Source = "website" | "instagram" | "referral" | "whatsapp" | "email" | "event" | "repeat" | "other";

export const STAGES: { key: Stage; label: string; chance: number }[] = [
  { key: "enquiry", label: "Enquiry", chance: 10 },
  { key: "discovery", label: "Discovery call", chance: 25 },
  { key: "proposal", label: "Proposal sent", chance: 50 },
  { key: "negotiation", label: "Negotiation", chance: 75 },
  { key: "won", label: "Won", chance: 100 },
  { key: "lost", label: "Lost", chance: 0 },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<Stage, string>;
export const OPEN_STAGES: Stage[] = ["enquiry", "discovery", "proposal", "negotiation"];

export const SOURCES: { key: Source; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "referral", label: "Referral" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "event", label: "Event" },
  { key: "repeat", label: "Repeat client" },
  { key: "other", label: "Other" },
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.key, s.label])) as Record<Source, string>;

export const LOST_REASONS = ["Budget", "Went with someone else", "Timing", "No response", "Not a fit", "Project cancelled", "Other"];

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  source: Source;
  service: string;
  budget: string;
  value: number;
  stage: Stage;
  lost_reason: string;
  owner_email: string | null;
  follow_up_on: string | null;
  message: string;
  notes: string;
  client_id: string | null;
  project_id: string | null;
  sort: number;
  won_at: string | null;
  lost_at: string | null;
  furthest_stage: Exclude<Stage, "lost">;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export function pipeline(leads: Pick<Lead, "stage" | "value">[]) {
  const by = STAGES.map((s) => {
    const list = leads.filter((l) => l.stage === s.key);
    return { stage: s.key, label: s.label, count: list.length, value: round2(list.reduce((t, l) => t + l.value, 0)) };
  });
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const weighted = round2(open.reduce((t, l) => t + (l.value * (STAGES.find((s) => s.key === l.stage)?.chance ?? 0)) / 100, 0));
  return { by, open: open.length, openValue: round2(open.reduce((t, l) => t + l.value, 0)), weighted };
}

/** Leads created in [from, to]: how many got to each stage, win rate, by source, average days to win. */
export function leadFunnel(leads: Pick<Lead, "stage" | "source" | "created_at" | "won_at" | "value" | "furthest_stage">[], from: string, to: string) {
  const inRange = leads.filter((l) => l.created_at.slice(0, 10) >= from && l.created_at.slice(0, 10) <= to);
  const reached = (min: number) => inRange.filter((l) => STAGES.findIndex((s) => s.key === l.furthest_stage) >= min).length;
  const won = inRange.filter((l) => l.stage === "won");
  const decided = inRange.filter((l) => l.stage === "won" || l.stage === "lost");
  const sources = SOURCES.map((s) => {
    const list = inRange.filter((l) => l.source === s.key);
    const w = list.filter((l) => l.stage === "won");
    const d = list.filter((l) => l.stage === "won" || l.stage === "lost");
    return { source: s.label, leads: list.length, won: w.length, value: round2(w.reduce((t, l) => t + l.value, 0)), winRate: d.length ? Math.round((w.length / d.length) * 100) : null };
  }).filter((s) => s.leads > 0);
  const days = won.filter((l) => l.won_at).map((l) => daysBetween(l.created_at.slice(0, 10), l.won_at!.slice(0, 10)));
  return {
    stages: [
      { stage: "Enquiries", count: inRange.length, value: round2(inRange.reduce((t, l) => t + l.value, 0)) },
      { stage: "Had a call", count: reached(1), value: 0 },
      { stage: "Got a proposal", count: reached(2), value: 0 },
      { stage: "Won", count: won.length, value: round2(won.reduce((t, l) => t + l.value, 0)) },
    ],
    winRate: decided.length ? Math.round((won.length / decided.length) * 100) : null,
    sources,
    avgDaysToWin: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
  };
}

// ---------------------------------------------------------------------------
// Booking slots
// ---------------------------------------------------------------------------
export interface BookingSettings {
  enabled: boolean;
  slug: string;
  title: string;
  minutes: number;
  days: number[]; // 0 = Sunday … 6 = Saturday
  start: string; // "11:00" IST
  end: string; // "18:00" IST
  buffer: number;
  notice_hours: number;
  horizon_days: number;
  location: string;
}

export const DEFAULT_BOOKING: BookingSettings = {
  enabled: false,
  slug: "kora-kaagaz",
  title: "Discovery call",
  minutes: 30,
  days: [1, 2, 3, 4, 5],
  start: "11:00",
  end: "18:00",
  buffer: 15,
  notice_hours: 12,
  horizon_days: 21,
  location: "Google Meet (link sent by email)",
};

const istToUtc = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`);

/**
 * Free start times (ISO instants) per IST date, from the working hours minus busy events
 * (with a buffer on both sides), at least `notice_hours` ahead, within `horizon_days`.
 */
export function freeSlots(b: BookingSettings, busy: { starts_at: string; ends_at: string }[], now: Date, holidays: string[] = []) {
  const step = Math.max(15, b.minutes);
  const earliest = now.getTime() + b.notice_hours * 3600000;
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const blocks = busy.map((e) => [Date.parse(e.starts_at) - b.buffer * 60000, Date.parse(e.ends_at) + b.buffer * 60000]);
  const out: { date: string; slots: string[] }[] = [];
  for (let i = 0; i <= b.horizon_days; i++) {
    const date = addDays(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!b.days.includes(dow) || holidays.includes(date)) continue;
    const slots: string[] = [];
    for (let t = istToUtc(date, b.start); t + b.minutes * 60000 <= istToUtc(date, b.end); t += step * 60000) {
      const end = t + b.minutes * 60000;
      if (t < earliest) continue;
      if (blocks.some(([s, e]) => t < e && end > s)) continue;
      slots.push(new Date(t).toISOString());
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "book";
}
