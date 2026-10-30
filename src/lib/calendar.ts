// Calendar helpers: IST conversions, booking conflicts, iCalendar feed (pure).
import { addDays } from "./money";

export type EventType = "shoot" | "meeting" | "deadline" | "other";
export type EventStatus = "tentative" | "confirmed" | "cancelled";

export const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: "shoot", label: "Shoot" },
  { key: "meeting", label: "Meeting" },
  { key: "deadline", label: "Deadline" },
  { key: "other", label: "Other" },
];

export interface StudioEvent {
  id: string;
  type: EventType;
  title: string;
  project_id: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  map_url: string;
  status: EventStatus;
  call_time: string | null;
  notes: string;
  shot_list: string;
  contacts: string;
  people: { member_email: string | null; external_name: string; role: string; phone: string }[];
  kit: string[]; // kit ids
}

const IST = "+05:30";

/** "2026-11-04T09:30" (datetime-local, IST) → ISO instant. */
export function istLocalToIso(local: string): string {
  return new Date(`${local.length === 16 ? `${local}:00` : local}${IST}`).toISOString();
}

/** ISO instant → "2026-11-04T09:30" in IST, for datetime-local inputs. */
export function isoToIstLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}

/** IST calendar date of an instant. */
export function istDate(iso: string): string {
  return isoToIstLocal(iso).slice(0, 10);
}

export function istTime(iso: string): string {
  return isoToIstLocal(iso).slice(11, 16);
}

/** Every IST date an event touches (an event ending exactly at midnight doesn't touch the next day). */
export function eventDays(e: Pick<StudioEvent, "starts_at" | "ends_at">): string[] {
  const first = istDate(e.starts_at);
  const endIso = new Date(Math.max(Date.parse(e.starts_at), Date.parse(e.ends_at) - 1)).toISOString();
  const last = istDate(endIso);
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

export function overlaps(a: Pick<StudioEvent, "starts_at" | "ends_at">, b: Pick<StudioEvent, "starts_at" | "ends_at">): boolean {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

export interface Conflict {
  with: Pick<StudioEvent, "id" | "title" | "starts_at" | "status">;
  people: string[];
  kit: string[];
}

/**
 * Other events that overlap this one in time and share a team member or a kit item.
 * Cancelled events and deadlines never conflict.
 */
export function findConflicts(
  draft: Pick<StudioEvent, "id" | "starts_at" | "ends_at" | "status" | "type"> & { people: string[]; kit: string[] },
  others: (Pick<StudioEvent, "id" | "title" | "starts_at" | "ends_at" | "status" | "type"> & { people: string[]; kit: string[] })[],
): Conflict[] {
  if (draft.status === "cancelled" || draft.type === "deadline") return [];
  const out: Conflict[] = [];
  for (const o of others) {
    if (o.id === draft.id || o.status === "cancelled" || o.type === "deadline" || !overlaps(draft, o)) continue;
    const people = draft.people.filter((p) => o.people.includes(p));
    const kit = draft.kit.filter((k) => o.kit.includes(k));
    if (people.length || kit.length) out.push({ with: { id: o.id, title: o.title, starts_at: o.starts_at, status: o.status }, people, kit });
  }
  return out;
}

/** Month grid: 6 rows × 7 days starting Monday, covering the month of `iso`. */
export function monthGrid(iso: string): string[][] {
  const first = `${iso.slice(0, 7)}-01`;
  const day = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, day === 0 ? -6 : 1 - day);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545) feed for Google/Apple Calendar subscriptions
// ---------------------------------------------------------------------------
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (d: string) => d.replace(/-/g, "");

export interface IcsItem {
  uid: string;
  title: string;
  start: string; // ISO instant, or yyyy-mm-dd when allDay
  end: string; // ISO instant, or yyyy-mm-dd (inclusive last day) when allDay
  allDay: boolean;
  description?: string;
  location?: string;
  url?: string;
  tentative?: boolean;
  updated?: string;
}

export function toIcs(name: string, items: IcsItem[], now = new Date().toISOString()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kora Kaagaz//Studio//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(name)}`, "X-WR-TIMEZONE:Asia/Kolkata"];
  for (const it of items) {
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@korakaagaz.studio`, `DTSTAMP:${utcStamp(it.updated ?? now)}`);
    if (it.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(it.start)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(it.end, 1))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(it.start)}`, `DTEND:${utcStamp(it.end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${icsEscape(it.description)}`);
    if (it.location) lines.push(`LOCATION:${icsEscape(it.location)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    if (it.tentative) lines.push("STATUS:TENTATIVE");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
