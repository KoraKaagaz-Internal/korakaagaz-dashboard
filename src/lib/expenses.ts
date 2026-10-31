// Expense maths (pure): GST split, TDS suggestions, input-credit buckets, rebill lines,
// recurring dates and GSTR-2B matching. Tax figures are FY 2025-26 rules: check with your CA.
import { addMonths, round2 } from "./money";

export type ExpenseKind = "bill" | "receipt" | "claim";
export type ItcStatus = "eligible" | "blocked" | "ineligible";
export type Gstr2b = "not_checked" | "matched" | "mismatch" | "missing";

export interface TdsNature {
  code: string;
  label: string;
  /** Percent for individuals/HUF; `companyRate` when the payee is a company/firm. */
  rate: number;
  companyRate?: number;
  /** Deduct once a single bill crosses this (taxable value). */
  single?: number;
  /** …or once the year's total to this payee crosses this. */
  yearly?: number;
  /** Rent thresholds are per month. */
  monthly?: number;
}

/**
 * Natures of payment, not section numbers: the Income-tax Act 2025 renumbers sections from
 * 1 April 2026 (one table, s.393), while rates and limits stay broadly the same.
 */
export const TDS_NATURES: TdsNature[] = [
  { code: "none", label: "No TDS", rate: 0 },
  { code: "professional", label: "Professional fees (194J) · 10%", rate: 10, yearly: 50000 },
  { code: "technical", label: "Technical services (194J) · 2%", rate: 2, yearly: 50000 },
  { code: "contractor", label: "Contract work (194C) · 1% / 2%", rate: 1, companyRate: 2, single: 30000, yearly: 100000 },
  { code: "rent_building", label: "Rent: building (194I) · 10%", rate: 10, monthly: 50000 },
  { code: "rent_machinery", label: "Rent: equipment (194I) · 2%", rate: 2, monthly: 50000 },
  { code: "commission", label: "Commission (194H) · 2%", rate: 2, yearly: 20000 },
];

export const TDS_NO_PAN_RATE = 20;

export function tdsNature(code: string): TdsNature {
  return TDS_NATURES.find((n) => n.code === code) ?? TDS_NATURES[0];
}

/**
 * Should TDS be deducted on this bill, and at what rate? TDS is on the value before GST
 * (CBDT circular 23/2017) when GST is shown separately.
 */
export function suggestTds(input: { nature: string; taxable: number; isCompany: boolean; hasPan: boolean; paidThisYear: number; paidThisMonth?: number }) {
  const n = tdsNature(input.nature);
  if (n.code === "none" || input.taxable <= 0) return { apply: false, rate: 0, amount: 0, reason: "" };
  const crossesSingle = n.single !== undefined && input.taxable > n.single;
  const crossesYear = n.yearly !== undefined && input.paidThisYear + input.taxable > n.yearly;
  const crossesMonth = n.monthly !== undefined && (input.paidThisMonth ?? 0) + input.taxable > n.monthly;
  const apply = crossesSingle || crossesYear || crossesMonth;
  const base = input.isCompany && n.companyRate !== undefined ? n.companyRate : n.rate;
  const rate = apply ? (input.hasPan ? base : Math.max(base, TDS_NO_PAN_RATE)) : 0;
  const reason = !apply
    ? n.monthly
      ? `Under ₹${n.monthly.toLocaleString("en-IN")} this month: no TDS yet`
      : `Under the ₹${(n.yearly ?? n.single ?? 0).toLocaleString("en-IN")} limit for this payee this year: no TDS yet`
    : crossesSingle
      ? `Single bill over ₹${n.single!.toLocaleString("en-IN")}`
      : crossesMonth
        ? `Over ₹${n.monthly!.toLocaleString("en-IN")} this month`
        : `Payee crosses ₹${n.yearly!.toLocaleString("en-IN")} this financial year`;
  return { apply, rate, amount: round2((input.taxable * rate) / 100), reason: input.hasPan || !apply ? reason : `${reason}. No PAN: 20%` };
}

/**
 * GST on a purchase: CGST+SGST when the supplier is in our state (or unknown), IGST otherwise.
 * Under reverse charge the supplier's bill has no GST: we pay it to the government (and claim it
 * back as input credit), so the amount owed to the supplier is just the taxable value.
 */
export function purchaseGst(input: { taxable: number; rate: number; supplierState: string; ourState: string; rcm: boolean }) {
  const tax = round2((input.taxable * input.rate) / 100);
  const inter = !!input.supplierState && !!input.ourState && input.supplierState !== input.ourState;
  const cgst = inter ? 0 : round2(tax / 2);
  const sgst = inter ? 0 : round2(tax - cgst);
  const igst = inter ? tax : 0;
  return { cgst, sgst, igst, tax, total: round2(input.rcm ? input.taxable : input.taxable + tax) };
}

export interface ExpenseLike {
  id: string;
  kind: ExpenseKind;
  expense_date: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  rcm: boolean;
  itc_status: ItcStatus;
  gstr2b: Gstr2b;
  itc_month: string | null;
  fx_rate: number;
  currency: string;
}

const gstOf = (e: Pick<ExpenseLike, "cgst" | "sgst" | "igst">) => round2(e.cgst + e.sgst + e.igst);

/**
 * GSTR-3B Table 4 view of a month's purchases:
 * 4A all credit on the bills, 4B(1) blocked under s.17(5), 4B(2) held back (supplier hasn't
 * filed / doesn't match 2B, or unpaid after 180 days), 4C net credit. Also reverse-charge tax
 * to pay in cash. Bills count in the month set as their ITC month, else their bill date.
 */
export function itcSummary(expenses: (ExpenseLike & { unpaid_days?: number })[], month: string) {
  const out = { a: 0, b1: 0, b2: 0, c: 0, rcmPayable: 0, count: 0 };
  for (const e of expenses) {
    if (e.itc_status === "ineligible" || gstOf(e) === 0) continue;
    if ((e.itc_month ?? e.expense_date).slice(0, 7) !== month.slice(0, 7)) continue;
    const g = gstOf(e);
    out.count++;
    out.a += g;
    if (e.rcm) out.rcmPayable += g;
    if (e.itc_status === "blocked") out.b1 += g;
    else if (e.gstr2b === "missing" || e.gstr2b === "mismatch" || (e.unpaid_days ?? 0) > 180) out.b2 += g;
  }
  out.a = round2(out.a);
  out.b1 = round2(out.b1);
  out.b2 = round2(out.b2);
  out.rcmPayable = round2(out.rcmPayable);
  out.c = round2(out.a - out.b1 - out.b2);
  return out;
}

/**
 * Invoice lines for re-billing expenses to a client. Markup is on the pre-tax cost (so GST isn't
 * marked up); when we can't claim the GST back (blocked/ineligible), the GST is part of our cost.
 */
export function rebillLines(
  expenses: { category: string; description: string; vendor: string; taxable: number; total: number; rcm: boolean; itc_status: ItcStatus; markup_pct: number; fx_rate: number }[],
  sac: string,
) {
  return expenses.map((e) => {
    const cost = e.itc_status === "eligible" || e.rcm ? e.taxable : e.total;
    const price = round2(cost * (e.fx_rate || 1) * (1 + (e.markup_pct || 0) / 100));
    return {
      title: e.description ? `${e.category}: ${e.description}` : e.category,
      description: e.vendor ? `Incurred via ${e.vendor}` : "",
      sac,
      qty: 1,
      unit_price: price,
    };
  });
}

export function nextRecurring(date: string, every: "month" | "quarter" | "year"): string {
  return addMonths(date, every === "year" ? 12 : every === "quarter" ? 3 : 1);
}

// ---------------------------------------------------------------------------
// GSTR-2B reconciliation from a CSV the user downloads from the GST portal
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export interface PortalBill {
  gstin: string;
  invoice_no: string;
  taxable: number;
  tax: number;
}

const num = (s: string) => Number(String(s).replace(/[₹,\s]/g, "")) || 0;

/**
 * Finds the header row (the one naming GSTIN and invoice number) and reads B2B lines. Works with
 * the portal's Excel saved as CSV, and with a hand-made CSV using similar column names.
 */
export function readPortal2b(csv: string): PortalBill[] {
  const rows = parseCsv(csv);
  const hi = rows.findIndex((r) => r.some((c) => /gstin/i.test(c)) && r.some((c) => /invoice\s*(no|number)/i.test(c)));
  if (hi < 0) return [];
  const head = rows[hi].map((c) => c.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const g = col(/gstin/);
  const n = col(/invoice\s*(no|number)/);
  const tv = col(/taxable/);
  const it = col(/integrated/);
  const ct = col(/central/);
  const st = col(/state|ut tax/);
  const out: PortalBill[] = [];
  for (const r of rows.slice(hi + 1)) {
    const gstin = (r[g] ?? "").trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) continue;
    out.push({
      gstin,
      invoice_no: (r[n] ?? "").trim(),
      taxable: tv >= 0 ? num(r[tv]) : 0,
      tax: round2((it >= 0 ? num(r[it]) : 0) + (ct >= 0 ? num(r[ct]) : 0) + (st >= 0 ? num(r[st]) : 0)),
    });
  }
  return out;
}

export const normaliseBillNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");

/** Matches our bills (with a GSTIN) to the portal's 2B lines on GSTIN + bill number, then tax (±₹1). */
export function match2b(ours: { id: string; gstin: string; bill_no: string; tax: number }[], portal: PortalBill[]) {
  const key = (g: string, n: string) => `${g.toUpperCase()}|${normaliseBillNo(n)}`;
  const byKey = new Map(portal.map((p) => [key(p.gstin, p.invoice_no), p]));
  const used = new Set<string>();
  const results = ours.map((o) => {
    const k = key(o.gstin, o.bill_no);
    const p = byKey.get(k);
    if (!p) return { id: o.id, status: "missing" as Gstr2b, portalTax: null as number | null };
    used.add(k);
    return { id: o.id, status: (Math.abs(p.tax - o.tax) <= 1 ? "matched" : "mismatch") as Gstr2b, portalTax: p.tax };
  });
  const notInBooks = portal.filter((p) => !used.has(key(p.gstin, p.invoice_no)));
  return { results, notInBooks };
}
