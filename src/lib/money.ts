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
  roundOff: number;
  total: number;
}

export function computeTotals(input: {
  items: Pick<LineItem, "qty" | "unit_price">[];
  discount_type: DiscountType;
  discount_value: number;
  gst_mode: GstMode;
  gst_rate: number;
  round_off?: boolean;
}): Totals {
  const subtotal = round2(input.items.reduce((s, i) => s + lineAmount(i), 0));

  let discount = 0;
  if (input.discount_type === "flat") discount = input.discount_value;
  if (input.discount_type === "percent") discount = (subtotal * input.discount_value) / 100;
  discount = round2(Math.min(Math.max(discount || 0, 0), subtotal));

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
  const exact = round2(taxable + tax);
  const total = input.round_off ? Math.round(exact) : exact;

  return { subtotal, discount, taxable, cgst, sgst, igst, tax, roundOff: round2(total - exact), total };
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

export const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$", AUD: "A$", CAD: "C$" };

export function formatMoney(n: number, currency = "INR"): string {
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${formatAmount(n, currency)}`;
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-26" -> "26th Sep, 2026" (template style). */
export function formatInvoiceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const suffix =
    d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${MONTHS[m - 1]}, ${y}`;
}

/** Today's date in India (servers run on UTC, which is a day behind before 05:30 IST). */
export function todayIso(timeZone = "Asia/Kolkata"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(toIso.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000);
}

/** Indian financial year label for a date: 2026-10-27 -> "26-27", 2027-02-01 -> "26-27". */
export function financialYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Rule 46(b): up to 16 characters, letters, digits, hyphen and slash only. */
export function isValidDocNumber(n: string): boolean {
  return n.length > 0 && n.length <= 16 && /^[A-Za-z0-9/-]+$/.test(n);
}

// ---------------------------------------------------------------------------
// Amount in words (Indian numbering: thousand, lakh, crore)
// ---------------------------------------------------------------------------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

export function numberToIndianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? numberToIndianWords(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
  INR: ["Rupees", "Paise"],
  USD: ["US Dollars", "Cents"],
  EUR: ["Euros", "Cents"],
  GBP: ["Pounds", "Pence"],
};

/** 15000 -> "Rupees Fifteen Thousand Only"; 1234.5 -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" */
export function amountInWords(amount: number, currency = "INR"): string {
  const [major, minor] = CURRENCY_WORDS[currency] ?? [currency, "Cents"];
  const value = round2(Math.abs(amount));
  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 100);
  const wholeWords = currency === "INR" ? numberToIndianWords(whole) : westernWords(whole);
  return `${major} ${wholeWords}${fraction ? ` and ${twoDigits(fraction)} ${minor}` : ""} Only`;
}

function westernWords(n: number): string {
  if (n === 0) return "Zero";
  const units = ["", "Thousand", "Million", "Billion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${threeDigits(chunk)}${units[i] ? ` ${units[i]}` : ""}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

/** "2026-09-26" -> "26 Sep" (this year) or "26 Sep 2025". */
export function formatShortDate(iso: string | null | undefined, today = todayIso()): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return y === Number(today.slice(0, 4)) ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`;
}

/** An instant shown in India time: "26 Sep, 3:05 pm". */
export function formatDateTime(instant: string | Date | null | undefined): string {
  if (!instant) return "";
  const t = new Date(instant);
  if (Number.isNaN(t.getTime())) return "";
  const date = t.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const time = t.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  return `${formatShortDate(date)}, ${time}`;
}

/** "today", "tomorrow", "in 3 days", "2 days ago" for a date relative to today (India). */
export function formatRelative(iso: string | null | undefined, today = todayIso()): string {
  if (!iso) return "";
  const n = daysBetween(today, iso.slice(0, 10));
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1 && n < 14) return `in ${n} days`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  return formatShortDate(iso, today);
}
