// Number formats shared by server pages and client charts (keep this file free of "use client").

/** Rupees in short form for axis ticks and tiles: ₹4.2L, ₹1.1Cr, ₹850. */
export function compactInr(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const body = a >= 10000000 ? `${(a / 10000000).toFixed(1)}Cr` : a >= 100000 ? `${(a / 100000).toFixed(1)}L` : a >= 1000 ? `${Math.round(a / 1000)}k` : `${Math.round(a)}`;
  return `${sign}₹${body}`;
}

export const inrFull = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

export type Fmt = "inr" | "pct" | "days" | "num";

/** Charts take a format name (functions can't be passed from server to client components). */
export function fmt(kind: Fmt = "inr", n: number): string {
  if (kind === "pct") return `${Math.round(n)}%`;
  if (kind === "days") return `${Math.round(n)}d`;
  if (kind === "num") return Math.round(n).toLocaleString("en-IN");
  return compactInr(n);
}

/** Chart categorical order, validated (CVD + normal vision) on white; slot 1 is the brand navy. */
export const SERIES = ["#3846b4", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
