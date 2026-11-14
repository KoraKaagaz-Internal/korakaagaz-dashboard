import { inr } from "./reports";
import { round2 } from "./money";
import type { DocumentRecord } from "./types";

/** Quoted (latest live quotes), billed (issued invoices − credit notes), received (payments + TDS), in INR. */
export function projectTotals(docs: DocumentRecord[]) {
  let quoted = 0,
    billed = 0,
    received = 0,
    outstanding = 0;
  for (const d of docs) {
    if (d.doc_type === "quote" && ["issued", "accepted"].includes(d.status)) quoted += inr(d, d.taxable);
    if (d.doc_type === "invoice" && d.status === "issued") {
      billed += inr(d, d.taxable);
      received += inr(d, (d.balance?.paid ?? 0) + (d.balance?.tds ?? 0));
      outstanding += inr(d, d.balance?.balance ?? 0);
    }
    if (d.doc_type === "credit_note" && d.status === "issued") billed -= inr(d, d.taxable);
  }
  return { quoted: round2(quoted), billed: round2(billed), received: round2(received), outstanding: round2(outstanding) };
}

/** The expense category that holds each project's team split (seeded in migration 0020). */
export const SPLIT_CATEGORY = "Freelancer: team split";

/** Months a retainer has run: start month to end (or today) month, inclusive, at least 1. */
export function retainerMonths(start: string | null, end: string | null, today: string): number {
  const from = start ?? today;
  const to = end && end < today ? end : today;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

/** What the client owes for the whole project: the fixed fee, or the retainer for the months it has run. */
export function projectFee(
  fin: { budget: number; billing: string; retainer_amount_month: number } | null,
  p: { start_date: string | null; due_date: string | null },
  today: string,
): number {
  if (!fin) return 0;
  return round2(fin.billing === "retainer" ? fin.retainer_amount_month * retainerMonths(p.start_date, p.due_date, today) : fin.budget);
}

/** A split entered as ₹ or as % of the fee, in ₹. */
export function splitAmount(value: number, mode: "inr" | "pct", fee: number): number {
  return round2(mode === "pct" ? (fee * value) / 100 : value);
}

/**
 * A project's P&L in INR. Payments are money received (with TDS the client kept); expenses are
 * the project's non-rejected costs, with the team split kept apart.
 */
export function projectMoney(
  fee: number,
  payments: { amount: number; tds_amount: number }[],
  expenses: { split: boolean; cost: number; paid: number; balance: number }[],
) {
  const received = round2(payments.reduce((s, p) => s + p.amount + p.tds_amount, 0));
  const splits = expenses.filter((e) => e.split);
  const split = round2(splits.reduce((s, e) => s + e.cost, 0));
  const splitPaid = round2(splits.reduce((s, e) => s + e.paid, 0));
  const other = round2(expenses.filter((e) => !e.split).reduce((s, e) => s + e.cost, 0));
  return {
    fee,
    received,
    pending: round2(Math.max(0, fee - received)),
    split,
    splitPaid,
    splitDue: round2(splits.reduce((s, e) => s + e.balance, 0)),
    other,
    share: round2(Math.max(fee, received) - split - other),
  };
}
