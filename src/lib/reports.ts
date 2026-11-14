import { daysBetween, round2 } from "./money";
import type { DocumentRecord, Payment } from "./types";

/** INR value of a document (foreign-currency documents use their exchange rate). */
export function inr(doc: Pick<DocumentRecord, "currency" | "fx_rate">, amount: number): number {
  return round2(doc.currency === "INR" ? amount : amount * (doc.fx_rate || 1));
}

const counted = (d: DocumentRecord) => d.status === "issued" || d.status === "accepted";

/**
 * Every rupee that came in (INR): payments on invoices and projects, plus advances on the day the
 * receipt voucher was issued. Advance adjustments (mode "advance") are skipped: that money was
 * already counted when the receipt came in.
 */
export function moneyIn(docs: DocumentRecord[], payments: (Pick<Payment, "paid_on" | "amount" | "tds_amount" | "mode"> & { currency: string; fx_rate: number })[]) {
  const out: { date: string; amount: number; tds: number }[] = [];
  for (const p of payments) if (p.mode !== "advance") out.push({ date: p.paid_on, amount: inr(p, p.amount), tds: inr(p, p.tds_amount) });
  for (const d of docs) if (d.doc_type === "receipt" && d.status === "issued") out.push({ date: d.issue_date, amount: inr(d, d.total), tds: 0 });
  return out;
}

/** Money in vs money out per month (INR), oldest first. */
export function cashByMonth(ins: { date: string; amount: number }[], outs: { date: string; amount: number }[], today: string, months = 12) {
  const [y, m] = today.split("-").map(Number);
  const buckets = Array.from({ length: months }, (_, k) => {
    const dt = new Date(Date.UTC(y, m - months + k, 1));
    return { month: dt.toISOString().slice(0, 7), label: dt.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }), in: 0, out: 0 };
  });
  const index = new Map(buckets.map((b, i) => [b.month, i]));
  for (const [list, key] of [[ins, "in"], [outs, "out"]] as const) {
    for (const x of list) {
      const i = index.get(x.date.slice(0, 7));
      if (i !== undefined) buckets[i][key] = round2(buckets[i][key] + x.amount);
    }
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
  let outstanding = 0,
    overdue = 0,
    overdueCount = 0,
    revenueFy = 0,
    quotesOpen = 0,
    quotesOpenCount = 0,
    won = 0,
    lost = 0;
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
  let collectedFy = 0,
    tdsFy = 0;
  for (const m of moneyIn(docs, payments)) {
    if (fyOf(m.date) !== fy) continue;
    collectedFy += m.amount;
    tdsFy += m.tds;
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
