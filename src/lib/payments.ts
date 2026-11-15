import { financialYear, round2 } from "./money";

/** Ways a client can pay (advance = an adjusted receipt voucher, never picked by hand). */
export const PAY_MODES = [
  ["upi", "UPI"],
  ["bank", "Bank transfer"],
  ["cash", "Cash"],
  ["cheque", "Cheque"],
  ["card", "Card"],
  ["wire", "Wire (abroad)"],
  ["other", "Other"],
] as const;
export type PayMode = (typeof PAY_MODES)[number][0] | "advance";
export const modeLabel = (m: string) => PAY_MODES.find(([k]) => k === m)?.[1] ?? (m === "advance" ? "Advance adjusted" : m);

/** One payment, in INR, with where it came from. */
export interface PaymentLine {
  id: string;
  paid_on: string;
  amount: number;
  tds: number;
  mode: string;
  reference: string;
  note: string;
  client: string;
  project: { id: string; code: string; name: string } | null;
  invoice: { id: string; number: string } | null;
  file_name: string;
}

/** Something that can be paid: a project (fee − received) or an invoice that isn't on a project. */
export interface PayTarget {
  key: string;
  kind: "project" | "invoice";
  id: string;
  label: string;
  client: string;
  pending: number;
  /** issued invoices on this project that still have a balance */
  invoices: { id: string; number: string; balance: number }[];
}

/** Today, this month, this FY and the split by method; advances are counted once, when the receipt came in. */
export function summarise(lines: PaymentLine[], today: string) {
  const fy = financialYear(today);
  const month = today.slice(0, 7);
  let day = 0,
    mon = 0,
    year = 0,
    tds = 0;
  const byMode = new Map<string, number>();
  for (const l of lines) {
    if (l.mode === "advance") continue;
    if (financialYear(l.paid_on) !== fy) continue;
    year += l.amount;
    tds += l.tds;
    if (l.paid_on.slice(0, 7) === month) mon += l.amount;
    if (l.paid_on === today) day += l.amount;
    byMode.set(l.mode, (byMode.get(l.mode) ?? 0) + l.amount);
  }
  return {
    today: round2(day),
    month: round2(mon),
    fy: round2(year),
    tds: round2(tds),
    byMode: [...byMode.entries()].map(([mode, amount]) => ({ mode, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

/**
 * What clients still owe, most first: each project's fee minus what it received, plus invoices
 * that aren't on any project (their balance). An invoice on a project is part of that project's
 * fee, so it is listed under the project, never counted twice.
 */
export function payTargets(
  projects: { id: string; code: string; name: string; client: string; fee: number; received: number }[],
  invoices: { id: string; number: string; client: string; project_id: string | null; balance: number }[],
): PayTarget[] {
  const open = invoices.filter((i) => i.balance > 0.005);
  const out: PayTarget[] = projects.map((p) => ({
    key: `project:${p.id}`,
    kind: "project",
    id: p.id,
    label: `${p.code} · ${p.name}`,
    client: p.client,
    pending: round2(Math.max(0, p.fee - p.received)),
    invoices: open.filter((i) => i.project_id === p.id).map((i) => ({ id: i.id, number: i.number, balance: round2(i.balance) })),
  }));
  for (const i of open.filter((x) => !x.project_id || !projects.some((p) => p.id === x.project_id))) {
    out.push({ key: `invoice:${i.id}`, kind: "invoice", id: i.id, label: `Invoice ${i.number}`, client: i.client, pending: round2(i.balance), invoices: [] });
  }
  return out.sort((a, b) => b.pending - a.pending || a.label.localeCompare(b.label));
}
