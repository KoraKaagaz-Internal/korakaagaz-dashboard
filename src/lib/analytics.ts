// Studio analytics (pure, INR). Accrual basis = invoices issued; cash basis = money received.
// Costs: expenses at their real cost (pre-GST when the GST is claimable), approved time × cost rate.
import { addDays, daysBetween, round2 } from "./money";
import { availableDays, weekCapacity, weekStart } from "./time";

export interface ADoc {
  id: string;
  doc_type: string;
  status: string;
  client_id: string | null;
  client_name: string;
  project_id: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  fx_rate: number;
  taxable: number;
  total: number;
  source_id: string | null;
  source_relation: string | null;
  recurring: { every: string; next: string } | null;
  balance: number | null;
}
export interface APay {
  /** null for money logged straight on a project (no invoice) */
  document_id: string | null;
  project_id: string | null;
  paid_on: string;
  amount: number;
  tds_amount: number;
}
export interface AExp {
  expense_date: string;
  category: string;
  category_kind: "overhead" | "pass_through";
  project_id: string | null;
  taxable: number;
  total: number;
  itc_status: string;
  rcm: boolean;
  fx_rate: number;
  kind: string;
  approval: string | null;
  is_draft: boolean;
  due_date: string | null;
  balance: number;
  recurring: { every: "month" | "quarter" | "year"; next: string } | null;
  tds_amount: number;
  tds_challan_id: string | null;
}
const inr = (d: Pick<ADoc, "currency" | "fx_rate">, n: number) => (d.currency === "INR" ? n : n * (d.fx_rate || 1));
const within = (date: string, from: string, to: string) => date >= from && date <= to;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------
export type Preset = "month" | "last_month" | "quarter" | "fy" | "last_fy" | "custom";

export function fyStart(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonths = (iso: string, n: number) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};

export function period(preset: Preset, today: string, custom?: { from?: string; to?: string }): { from: string; to: string; label: string } {
  const first = `${today.slice(0, 7)}-01`;
  const label = (from: string, to: string) =>
    `${new Date(`${from}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}${from.slice(0, 7) === to.slice(0, 7) ? "" : ` – ${new Date(`${to}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })}`}`;
  switch (preset) {
    case "last_month": {
      const from = shiftMonths(first, -1);
      return { from, to: monthEnd(from), label: label(from, from) };
    }
    case "quarter": {
      // Indian FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar
      const m = Number(today.slice(5, 7));
      const qStartMonth = [4, 7, 10, 1][Math.floor(((m + 8) % 12) / 3)];
      const y = Number(today.slice(0, 4));
      const from = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;
      const to = monthEnd(shiftMonths(from, 2));
      return { from, to, label: `Q${Math.floor(((m + 8) % 12) / 3) + 1} FY ${fyLabel(fyStart(from))}` };
    }
    case "fy": {
      const from = fyStart(today);
      return { from, to: addDays(shiftMonths(from, 12), -1), label: `FY ${fyLabel(from)}` };
    }
    case "last_fy": {
      const from = shiftMonths(fyStart(today), -12);
      return { from, to: addDays(fyStart(today), -1), label: `FY ${fyLabel(from)}` };
    }
    case "custom":
      if (custom?.from && custom?.to && custom.from <= custom.to) return { from: custom.from, to: custom.to, label: `${custom.from} → ${custom.to}` };
      return period("month", today);
    default:
      return { from: first, to: monthEnd(first), label: label(first, first) };
  }
}

const fyLabel = (from: string) => `${from.slice(2, 4)}-${String(Number(from.slice(2, 4)) + 1).padStart(2, "0")}`;

/** The period to compare with: the one just before (same length), or the same dates a year earlier. */
export function comparison(p: { from: string; to: string }, mode: "previous" | "year"): { from: string; to: string } {
  if (mode === "year") return { from: shiftYear(p.from, -1), to: shiftYear(p.to, -1) };
  const len = daysBetween(p.from, p.to) + 1;
  // whole months compare with the same number of whole months
  if (p.from.endsWith("-01") && p.to === monthEnd(p.to)) {
    const months = (Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4))) * 12 + Number(p.to.slice(5, 7)) - Number(p.from.slice(5, 7)) + 1;
    const from = shiftMonths(p.from, -months);
    return { from, to: addDays(p.from, -1) };
  }
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}
const shiftYear = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y + n, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return new Date(Date.UTC(y + n, m, 0)).toISOString().slice(0, 10); // 29 Feb
  return t.toISOString().slice(0, 10);
};

export function months(from: string, to: string): { key: string; label: string; from: string; to: string }[] {
  const out = [];
  for (let m = `${from.slice(0, 7)}-01`; m <= to; m = shiftMonths(m, 1)) {
    out.push({ key: m.slice(0, 7), label: new Date(`${m}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), from: m, to: monthEnd(m) });
    if (out.length > 60) break;
  }
  return out;
}

/** Last n whole months ending with the month of `to`. */
export function trailingMonths(to: string, n = 12) {
  return months(shiftMonths(`${to.slice(0, 7)}-01`, -(n - 1)), monthEnd(to));
}

export function delta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

// ---------------------------------------------------------------------------
// Revenue and costs as dated events
// ---------------------------------------------------------------------------
export interface RevEvent {
  date: string;
  client: string;
  project_id: string | null;
  amount: number;
}

const live = (d: ADoc) => d.status === "issued" || d.status === "accepted";

/** Accrual: taxable value of issued invoices, minus credit notes. */
export function accrualRevenue(docs: ADoc[]): RevEvent[] {
  return docs
    .filter((d) => live(d) && (d.doc_type === "invoice" || d.doc_type === "credit_note"))
    .map((d) => ({
      date: d.issue_date,
      client: d.client_name || "Unknown",
      project_id: d.project_id,
      amount: round2((d.doc_type === "credit_note" ? -1 : 1) * inr(d, d.taxable)),
    }));
}

/** Cash: money received (incl. TDS the client kept), without its GST share. */
export function cashRevenue(docs: ADoc[], pays: APay[]): RevEvent[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out: RevEvent[] = [];
  for (const p of pays) {
    const d = p.document_id ? byId.get(p.document_id) : undefined;
    if (!d || !d.total) continue;
    out.push({ date: p.paid_on, client: d.client_name || "Unknown", project_id: d.project_id, amount: round2(inr(d, (p.amount + p.tds_amount) * (d.taxable / d.total))) });
  }
  return out;
}

/** Money logged straight on a project, with no invoice: revenue on the day it came in (INR, no GST). */
export function directRevenue(pays: APay[], projects: { id: string; client_name: string }[]): RevEvent[] {
  const client = new Map(projects.map((p) => [p.id, p.client_name]));
  return pays
    .filter((p) => !p.document_id)
    .map((p) => ({ date: p.paid_on, client: client.get(p.project_id ?? "") || "Unknown", project_id: p.project_id, amount: round2(p.amount + p.tds_amount) }));
}

export interface CostEvent {
  date: string;
  category: string;
  kind: "overhead" | "pass_through";
  project_id: string | null;
  amount: number;
}

/** What expenses really cost: pre-GST when the GST comes back as credit, otherwise the full bill. */
export function expenseCosts(exps: AExp[]): CostEvent[] {
  return exps
    .filter((e) => !e.is_draft && (e.kind !== "claim" || e.approval === "approved"))
    .map((e) => ({
      date: e.expense_date,
      category: e.category,
      kind: e.category_kind,
      project_id: e.project_id,
      amount: round2((e.itc_status === "eligible" || e.rcm ? e.taxable : e.total) * (e.fx_rate || 1)),
    }));
}

export const sumIn = (events: { date: string; amount: number }[], from: string, to: string) =>
  round2(events.filter((e) => within(e.date, from, to)).reduce((s, e) => s + e.amount, 0));

// ---------------------------------------------------------------------------
// Profit & loss
// ---------------------------------------------------------------------------
export interface Pnl {
  revenue: number;
  passThrough: number;
  agi: number;
  overhead: number;
  net: number;
  grossMargin: number | null;
  netMargin: number | null;
  overheadRatio: number | null;
}

/** Revenue − project costs = gross income; − overheads (rent, software, salaries & retainers…) = net profit. */
export function pnl(rev: RevEvent[], costs: CostEvent[], from: string, to: string): Pnl {
  const revenue = sumIn(rev, from, to);
  const inRange = costs.filter((c) => within(c.date, from, to));
  const passThrough = round2(inRange.filter((c) => c.kind === "pass_through").reduce((s, c) => s + c.amount, 0));
  const overhead = round2(inRange.filter((c) => c.kind === "overhead").reduce((s, c) => s + c.amount, 0));
  const agi = round2(revenue - passThrough);
  const net = round2(agi - overhead);
  const pct = (n: number) => (agi > 0 ? round2((n / agi) * 100) : null);
  return { revenue, passThrough, agi, overhead, net, grossMargin: revenue > 0 ? round2((agi / revenue) * 100) : null, netMargin: pct(net), overheadRatio: pct(overhead) };
}

export function waterfall(p: Pnl): { label: string; value: number; kind: "total" | "down" | "up" }[] {
  return [
    { label: "Revenue", value: p.revenue, kind: "total" },
    { label: "Project costs", value: -p.passThrough, kind: "down" },
    { label: "Gross income", value: p.agi, kind: "total" },
    { label: "Overheads", value: -p.overhead, kind: "down" },
    { label: "Net profit", value: p.net, kind: "total" },
  ];
}

export function monthlyPnl(rev: RevEvent[], costs: CostEvent[], ms: ReturnType<typeof months>) {
  return ms.map((m) => {
    const p = pnl(rev, costs, m.from, m.to);
    return { key: m.key, label: m.label, revenue: p.revenue, costs: round2(p.passThrough + p.overhead), profit: p.net, agi: p.agi, margin: p.netMargin };
  });
}

/** Spend per category per month: the top `top` categories, the rest as "Other". */
export function categoryMonths(costs: CostEvent[], ms: ReturnType<typeof months>, top = 5) {
  const from = ms[0]?.from ?? "";
  const to = ms[ms.length - 1]?.to ?? "";
  const totals = new Map<string, number>();
  for (const c of costs) if (within(c.date, from, to)) totals.set(c.category, (totals.get(c.category) ?? 0) + c.amount);
  const keep = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k]) => k);
  const series = [...keep, ...(totals.size > keep.length ? ["Other"] : [])];
  return {
    series,
    totals: [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount: round2(amount) })),
    rows: ms.map((m) => {
      const row: Record<string, number | string> = { key: m.key, label: m.label };
      for (const s of series) row[s] = 0;
      for (const c of costs) {
        if (!within(c.date, m.from, m.to)) continue;
        const k = keep.includes(c.category) ? c.category : "Other";
        row[k] = round2((row[k] as number) + c.amount);
      }
      return row;
    }),
  };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export function concentration(rev: RevEvent[], from: string, to: string) {
  const by = new Map<string, number>();
  for (const e of rev) if (within(e.date, from, to)) by.set(e.client, (by.get(e.client) ?? 0) + e.amount);
  const rows = [...by.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  let cum = 0;
  return rows.map(([client, value]) => {
    cum += value;
    return { client, value: round2(value), share: total ? round2((value / total) * 100) : 0, cumulative: total ? round2((cum / total) * 100) : 0 };
  });
}

/** Revenue in each month from clients billed for the first time that month vs returning clients. */
export function newVsRepeat(rev: RevEvent[], ms: ReturnType<typeof months>) {
  const first = new Map<string, string>();
  for (const e of [...rev].sort((a, b) => a.date.localeCompare(b.date))) if (e.amount > 0 && !first.has(e.client)) first.set(e.client, e.date.slice(0, 7));
  return ms.map((m) => {
    let fresh = 0;
    let repeat = 0;
    for (const e of rev) {
      if (!within(e.date, m.from, m.to)) continue;
      if (first.get(e.client) === m.key) fresh += e.amount;
      else repeat += e.amount;
    }
    return { key: m.key, label: m.label, New: round2(fresh), Repeat: round2(repeat) };
  });
}

const quarterOf = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const fy = m >= 4 ? y : y - 1;
  const q = Math.floor(((m + 8) % 12) / 3) + 1;
  return { key: `${fy}-Q${q}`, label: `Q${q} ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`, index: fy * 4 + q - 1 };
};

/** Retention cohorts by the FY quarter a client was first billed: % of them billed again in each later quarter. */
export function cohorts(rev: RevEvent[], maxQuarters = 6) {
  const billed = new Map<string, Set<number>>();
  for (const e of rev) {
    if (e.amount <= 0) continue;
    const q = quarterOf(e.date).index;
    billed.set(e.client, (billed.get(e.client) ?? new Set()).add(q));
  }
  const groups = new Map<number, string[]>();
  for (const [client, qs] of billed) {
    const first = Math.min(...qs);
    groups.set(first, [...(groups.get(first) ?? []), client]);
  }
  const latest = Math.max(0, ...[...billed.values()].flatMap((s) => [...s]));
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, maxQuarters)
    .map(([q, clients]) => ({
      cohort: `Q${(q % 4) + 1} ${String(Math.floor(q / 4)).slice(2)}-${String(Math.floor(q / 4) + 1).slice(2)}`,
      clients: clients.length,
      later: Array.from({ length: Math.min(maxQuarters, latest - q) }, (_, i) => {
        const back = clients.filter((c) => billed.get(c)!.has(q + i + 1)).length;
        return round2((back / clients.length) * 100);
      }),
    }));
}

export function clientValue(rev: RevEvent[], docs: ADoc[], from: string, to: string) {
  const inv = docs.filter((d) => live(d) && d.doc_type === "invoice" && within(d.issue_date, from, to));
  const perClient = new Map<string, number>();
  for (const e of rev) perClient.set(e.client, (perClient.get(e.client) ?? 0) + e.amount);
  const lifetimes = [...perClient.values()].filter((v) => v > 0);
  const byProject = new Map<string, number>();
  for (const e of rev) if (e.project_id && within(e.date, from, to)) byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + e.amount);
  return {
    invoices: inv.length,
    avgInvoice: inv.length ? round2(inv.reduce((s, d) => s + inr(d, d.taxable), 0) / inv.length) : 0,
    avgProject: byProject.size ? round2([...byProject.values()].reduce((s, v) => s + v, 0) / byProject.size) : 0,
    lifetimeValue: lifetimes.length ? round2(lifetimes.reduce((s, v) => s + v, 0) / lifetimes.length) : 0,
    clients: new Set(rev.filter((e) => within(e.date, from, to) && e.amount > 0).map((e) => e.client)).size,
  };
}

/** Revenue by service: invoice lines grouped by title (catalog items keep consistent titles). */
export function byService(items: { title: string; amount: number }[], top = 8) {
  const by = new Map<string, number>();
  for (const i of items) {
    const k = i.title.trim() || "Untitled";
    by.set(k, (by.get(k) ?? 0) + i.amount);
  }
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const head = rows.slice(0, top).map(([service, value]) => ({ service, value: round2(value) }));
  const rest = rows.slice(top).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...head, { service: "Everything else", value: round2(rest) }] : head;
}

// ---------------------------------------------------------------------------
// Cash and collections
// ---------------------------------------------------------------------------
/** Receivables (incl. GST) outstanding at the end of a day. */
export function receivablesAt(docs: ADoc[], pays: APay[], date: string) {
  const ids = new Set<string>();
  let ar = 0;
  for (const d of docs) {
    if (!live(d) || d.issue_date > date) continue;
    if (d.doc_type === "invoice") {
      ar += inr(d, d.total);
      ids.add(d.id);
    } else if (d.doc_type === "credit_note") ar -= inr(d, d.total);
  }
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const p of pays) {
    if (p.paid_on > date || !p.document_id || !ids.has(p.document_id)) continue;
    ar -= inr(byId.get(p.document_id)!, p.amount + p.tds_amount);
  }
  return round2(Math.max(0, ar));
}

const billedIn = (docs: ADoc[], from: string, to: string) =>
  round2(
    docs
      .filter((d) => live(d) && within(d.issue_date, from, to) && (d.doc_type === "invoice" || d.doc_type === "credit_note"))
      .reduce((s, d) => s + (d.doc_type === "credit_note" ? -1 : 1) * inr(d, d.total), 0),
  );

const collectedIn = (docs: ADoc[], pays: APay[], from: string, to: string) => {
  const byId = new Map(docs.map((d) => [d.id, d]));
  return round2(
    pays
      .filter((p) => within(p.paid_on, from, to) && (!p.document_id || byId.has(p.document_id)))
      .reduce((s, p) => s + (p.document_id ? inr(byId.get(p.document_id)!, p.amount + p.tds_amount) : p.amount + p.tds_amount), 0),
  );
};

/** Days sales outstanding at the end of each month: receivables ÷ last 90 days' billing × 90. */
export function dsoSeries(docs: ADoc[], pays: APay[], ms: ReturnType<typeof months>) {
  return ms.map((m) => {
    const ar = receivablesAt(docs, pays, m.to);
    const billed = billedIn(docs, addDays(m.to, -89), m.to);
    return { key: m.key, label: m.label, dso: billed > 0 ? Math.round((ar / billed) * 90) : null, ar };
  });
}

export function billedVsCollected(docs: ADoc[], pays: APay[], ms: ReturnType<typeof months>) {
  return ms.map((m) => ({ key: m.key, label: m.label, Billed: billedIn(docs, m.from, m.to), Collected: collectedIn(docs, pays, m.from, m.to) }));
}

/** Collection effectiveness for a period: share of collectible money actually collected (100 = perfect). */
export function cei(docs: ADoc[], pays: APay[], from: string, to: string, today: string) {
  const begin = receivablesAt(docs, pays, addDays(from, -1));
  const end = receivablesAt(docs, pays, to);
  const sales = billedIn(docs, from, to);
  const asOf = to < today ? to : today;
  const current = round2(
    docs
      .filter((d) => live(d) && d.doc_type === "invoice" && d.issue_date <= to && (d.due_date ?? d.issue_date) >= asOf)
      .reduce((s, d) => s + Math.max(0, inr(d, d.balance ?? 0)), 0),
  );
  const denom = begin + sales - current;
  return denom > 0 ? Math.max(0, Math.min(100, Math.round(((begin + sales - end) / denom) * 100))) : null;
}

/** Cash in hand: opening balances plus everything received, minus everything paid out since. */
export function cashPosition(
  opening: number,
  openingDate: string | null,
  receipts: { date: string; amount: number }[],
  payouts: { date: string; amount: number }[],
  today: string,
) {
  const since = openingDate ?? "0000-01-01";
  const inflow = receipts.filter((r) => r.date >= since && r.date <= today).reduce((s, r) => s + r.amount, 0);
  const outflow = payouts.filter((r) => r.date >= since && r.date <= today).reduce((s, r) => s + r.amount, 0);
  const cash = round2(opening + inflow - outflow);
  const last90 = payouts.filter((r) => r.date > addDays(today, -90) && r.date <= today).reduce((s, r) => s + r.amount, 0);
  const burn = round2(last90 / 3);
  return { cash, monthlyBurn: burn, runwayMonths: burn > 0 ? round2(cash / burn) : null };
}

/**
 * 13-week forecast: money expected in (invoice balances by due date; overdue ones in week 1;
 * recurring retainers on their next date) and out (bill balances by due date, approved claims,
 * recurring expenses, TDS on the 7th).
 */
export function forecast13w(input: { today: string; cash: number; docs: ADoc[]; exps: AExp[] }) {
  const start = weekStart(input.today);
  const weeks = Array.from({ length: 13 }, (_, i) => ({ from: addDays(start, i * 7), to: addDays(start, i * 7 + 6), in: 0, out: 0 }));
  const slot = (date: string) => {
    if (date < weeks[0].from) return 0;
    const i = Math.floor(daysBetween(start, date) / 7);
    return i < 13 ? i : -1;
  };
  for (const d of input.docs) {
    if (d.doc_type === "invoice" && live(d) && (d.balance ?? 0) > 0.005) {
      const i = slot(d.due_date ?? d.issue_date);
      if (i >= 0) weeks[i].in += inr(d, d.balance ?? 0);
    }
    if (d.recurring?.next && d.status !== "cancelled") {
      let next = d.recurring.next;
      for (let k = 0; k < 4; k++) {
        const i = slot(next);
        if (i < 0) break;
        weeks[i].in += inr(d, d.total);
        next = addDays(next, d.recurring.every === "quarter" ? 91 : 30);
      }
    }
  }
  let tdsDue = 0;
  for (const e of input.exps) {
    if (e.is_draft) continue;
    if (e.balance > 0.005 && (e.kind !== "claim" || e.approval === "approved")) {
      const i = slot(e.kind === "claim" ? input.today : (e.due_date ?? e.expense_date));
      if (i >= 0) weeks[i].out += e.balance * (e.fx_rate || 1);
    }
    if (e.recurring?.next) {
      let next = e.recurring.next;
      for (let k = 0; k < 4; k++) {
        const i = slot(next);
        if (i < 0) break;
        weeks[i].out += e.total * (e.fx_rate || 1) - e.tds_amount;
        next = addDays(next, e.recurring.every === "year" ? 365 : e.recurring.every === "quarter" ? 91 : 30);
      }
    }
    if (e.tds_amount > 0 && !e.tds_challan_id) tdsDue += e.tds_amount;
  }
  if (tdsDue) {
    const [y, m] = input.today.split("-").map(Number);
    const seventh = new Date(Date.UTC(y, m - (Number(input.today.slice(8)) > 7 ? 0 : 1), 7)).toISOString().slice(0, 10);
    const i = slot(seventh < input.today ? input.today : seventh);
    if (i >= 0) weeks[i].out += tdsDue;
  }
  let bal = input.cash;
  return weeks.map((w) => {
    bal += w.in - w.out;
    return {
      week: w.from,
      label: new Date(`${w.from}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      in: round2(w.in),
      out: round2(w.out),
      balance: round2(bal),
    };
  });
}

// ---------------------------------------------------------------------------
// Projects and team
// ---------------------------------------------------------------------------
/** Per project, all time: revenue, expenses, profit. */
export function projectTable(projects: { id: string; code: string; name: string; status: string }[], rev: RevEvent[], costs: CostEvent[]) {
  return projects
    .map((p) => {
      const revenue = round2(rev.filter((e) => e.project_id === p.id).reduce((s, e) => s + e.amount, 0));
      const expenses = round2(costs.filter((c) => c.project_id === p.id).reduce((s, c) => s + c.amount, 0));
      const profit = round2(revenue - expenses);
      return { ...p, revenue, expenses, profit, margin: revenue > 0 ? round2((profit / revenue) * 100) : null };
    })
    .filter((p) => p.revenue || p.expenses)
    .sort((a, b) => b.revenue - a.revenue);
}

/** Hours logged ÷ available hours per person per week (available = capacity minus leave and holidays). */
export function utilisation(
  entries: { member_email: string; work_date: string; minutes: number }[],
  people: { email: string; capacity: number }[],
  weeks: string[],
  leave: Parameters<typeof availableDays>[2],
  holidays: string[],
) {
  return people.map((p) => ({
    email: p.email,
    weeks: weeks.map((w) => {
      const end = addDays(w, 6);
      const logged = entries.filter((e) => e.member_email === p.email && e.work_date >= w && e.work_date <= end).reduce((s, e) => s + e.minutes, 0) / 60;
      const cap = weekCapacity(p.capacity, availableDays(w, p.email, leave, holidays));
      return { week: w, logged: round2(logged), capacity: cap, pct: cap > 0 ? Math.round((logged / cap) * 100) : null };
    }),
  }));
}

export function onTime(tasks: { due_date: string | null; completed_at: string | null }[], from: string, to: string) {
  const done = tasks.filter((t) => t.due_date && t.completed_at && within(t.completed_at.slice(0, 10), from, to));
  const late = done.filter((t) => t.completed_at!.slice(0, 10) > t.due_date!);
  return { done: done.length, late: late.length, pct: done.length ? Math.round(((done.length - late.length) / done.length) * 100) : null };
}

/** Quotes issued in the period → accepted → turned into an invoice. */
export function quoteFunnel(docs: ADoc[], from: string, to: string) {
  const quotes = docs.filter((d) => d.doc_type === "quote" && within(d.issue_date, from, to) && ["issued", "accepted", "declined", "expired"].includes(d.status));
  const accepted = quotes.filter((d) => d.status === "accepted");
  const invoicedFrom = new Set(docs.filter((d) => d.doc_type === "invoice" && d.source_relation === "converted_from" && d.source_id).map((d) => d.source_id));
  const invoiced = accepted.filter((q) => invoicedFrom.has(q.id));
  const val = (l: ADoc[]) => round2(l.reduce((s, d) => s + inr(d, d.taxable), 0));
  const decided = quotes.filter((d) => d.status === "accepted" || d.status === "declined" || d.status === "expired").length;
  return {
    stages: [
      { stage: "Quoted", count: quotes.length, value: val(quotes) },
      { stage: "Accepted", count: accepted.length, value: val(accepted) },
      { stage: "Invoiced", count: invoiced.length, value: val(invoiced) },
    ],
    winRate: decided ? Math.round((accepted.length / decided) * 100) : null,
  };
}
