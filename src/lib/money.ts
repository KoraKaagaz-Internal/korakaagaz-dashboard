import type { DiscountType, GstMode, LineItem } from "./types";

/** Round to paise, avoiding float drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineAmount(item: Pick<LineItem, "qty" | "unit_price">): number {
  return round2((Number(item.qty) || 0) * (Number(item.unit_price) || 0));
}

export interface Totals {
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

export function computeTotals(input: {
  items: Pick<LineItem, "qty" | "unit_price">[];
  discount_type: DiscountType;
  discount_value: number;
  gst_mode: GstMode;
  gst_rate: number;
}): Totals {
  const subtotal = round2(input.items.reduce((s, i) => s + lineAmount(i), 0));

  let discount = 0;
  if (input.discount_type === "flat") discount = input.discount_value;
  if (input.discount_type === "percent") discount = (subtotal * input.discount_value) / 100;
  discount = round2(Math.min(Math.max(discount, 0), subtotal));

  const taxable = round2(subtotal - discount);
  const rate = Math.max(input.gst_rate || 0, 0);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.gst_mode === "cgst_sgst") {
    cgst = round2((taxable * rate) / 200);
    sgst = cgst;
  } else if (input.gst_mode === "igst") {
    igst = round2((taxable * rate) / 100);
  }
  const tax = round2(cgst + sgst + igst);

  return { subtotal, discount, taxable, cgst, sgst, igst, tax, total: round2(taxable + tax) };
}

/**
 * Indian digit grouping: 15000 -> "15,000", 150000 -> "1,50,000".
 * Paise are shown only when non-zero, matching the template ("15,000").
 */
export function formatAmount(n: number, currency = "INR"): string {
  const value = round2(n);
  const hasPaise = Math.round(Math.abs(value) * 100) % 100 !== 0;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return value.toLocaleString(locale, {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

/** "2026-09-26" -> "26th Sep, 2026" (template style). */
export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const suffix =
    d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${months[m - 1]}, ${y}`;
}

/** Today's date in India (servers run on UTC, which is a day behind before 05:30 IST). */
export function todayIso(timeZone = "Asia/Kolkata"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}
