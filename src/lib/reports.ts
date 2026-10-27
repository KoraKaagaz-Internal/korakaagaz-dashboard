import { daysBetween, round2 } from "./money";
import type { DocumentRecord, Payment } from "./types";

/** INR value of a document (foreign-currency documents use their exchange rate). */
export function inr(doc: Pick<DocumentRecord, "currency" | "fx_rate">, amount: number): number {
  return round2(doc.currency === "INR" ? amount : amount * (doc.fx_rate || 1));
}

const counted = (d: DocumentRecord) => d.status === "issued" || d.status === "accepted";

/** Monthly revenue (taxable value, INR) from issued invoices minus credit notes, oldest first. */
export function revenueByMonth(docs: DocumentRecord[], today: string, months = 12): { month: string; label: string; value: number }[] {
  const [y, m] = today.split("-").map(Number);
  const buckets: { month: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1 - i, 1));
    const month = dt.toISOString().slice(0, 7);
    buckets.push({ month, label: dt.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }), value: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const d of docs) {
    if (!counted(d) || !["invoice", "credit_note"].includes(d.doc_type)) continue;
    const i = index.get(d.issue_date.slice(0, 7));
    if (i === undefined) continue;
    buckets[i].value = round2(buckets[i].value + (d.doc_type === "credit_note" ? -1 : 1) * inr(d, d.taxable));
  }
  return buckets;
}

export const AGEING_BUCKETS = ["Not due yet", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

/** Outstanding receivables by days past due (INR). */
export function ageing(docs: DocumentRecord[], today: string): { bucket: (typeof AGEING_BUCKETS)[number]; value: number; count: number }[] {
  const out = AGEING_BUCKETS.map((bucket) => ({ bucket, value: 0, count: 0 }));
  for (const d of docs) {
    if (d.doc_type !== "invoice" || d.status !== "issued" || !d.balance || d.balance.balance <= 0.005) continue;
    const late = daysBetween(d.due_date ?? d.issue_date, today);
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    out[i].value = round2(out[i].value + inr(d, d.balance.balance));
    out[i].count++;
  }
  return out;
}

export interface Kpis {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  revenueFy: number;
  collectedFy: number;
  tdsFy: number;
  quotesOpen: number;
  quotesOpenCount: number;
  winRate: number | null;
}

export function kpis(docs: DocumentRecord[], payments: (Payment & { currency: string; fx_rate: number })[], fy: string, today: string): Kpis {
  const inFy = (d: DocumentRecord) => d.fy === fy || (!d.fy && fyOf(d.issue_date) === fy);
  let outstanding = 0, overdue = 0, overdueCount = 0, revenueFy = 0, quotesOpen = 0, quotesOpenCount = 0, won = 0, lost = 0;
  for (const d of docs) {
    if (d.doc_type === "invoice" && d.status === "issued" && d.balance) {
      outstanding += inr(d, d.balance.balance);
      if (d.balance.overdue || (d.due_date && d.due_date < today && d.balance.balance > 0.005)) {
        overdue += inr(d, d.balance.balance);
        overdueCount++;
      }
    }
    if (counted(d) && inFy(d) && d.doc_type === "invoice") revenueFy += inr(d, d.taxable);
    if (counted(d) && inFy(d) && d.doc_type === "credit_note") revenueFy -= inr(d, d.taxable);
    if (d.doc_type === "quote") {
      if (d.status === "issued") {
        quotesOpen += inr(d, d.total);
        quotesOpenCount++;
      }
      if (d.status === "accepted") won++;
      if (d.status === "declined" || d.status === "expired") lost++;
    }
  }
  let collectedFy = 0, tdsFy = 0;
  for (const p of payments) {
    if (fyOf(p.paid_on) !== fy || p.mode === "advance") continue;
    collectedFy += inr(p, p.amount);
    tdsFy += inr(p, p.tds_amount);
  }
  return {
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    overdueCount,
    revenueFy: round2(revenueFy),
    collectedFy: round2(collectedFy),
    tdsFy: round2(tdsFy),
    quotesOpen: round2(quotesOpen),
    quotesOpenCount,
    winRate: won + lost ? won / (won + lost) : null,
  };
}

function fyOf(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}
