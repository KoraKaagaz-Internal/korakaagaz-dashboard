// India statutory due dates for a small GST-registered services firm (pure). The government
// sometimes extends dates; these are the standing ones. Check with your CA.
import { addDays } from "./money";

export interface DueItem {
  date: string;
  title: string;
  detail: string;
  kind: "gst" | "tds" | "income_tax";
}

// QRMP GSTR-3B is due on the 22nd or 24th depending on the state (by state code).
const QRMP_24 = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "38"]);

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const monthName = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Due dates falling in [from, to].
 * gstFiling: monthly | qrmp | none. stateCode decides the QRMP 3B date.
 */
export function dueDates(from: string, to: string, opts: { gstFiling: "monthly" | "qrmp" | "none"; stateCode: string; tds: boolean }): DueItem[] {
  const out: DueItem[] = [];
  const push = (d: DueItem) => d.date >= from && d.date <= to && out.push(d);
  const [fy, fm] = from.split("-").map(Number);
  // walk the months that could produce a date in range (period month = month before the due month)
  for (let i = -3; i <= 15; i++) {
    const p = new Date(Date.UTC(fy, fm - 1 + i, 1)); // period month
    const y = p.getUTCFullYear();
    const m = p.getUTCMonth() + 1;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const label = monthName(y, m);
    const quarterEnd = m % 3 === 0;

    if (opts.gstFiling === "monthly") {
      push({ date: iso(ny, nm, 11), title: "GSTR-1", detail: `Sales for ${label}`, kind: "gst" });
      push({ date: iso(ny, nm, 20), title: "GSTR-3B + GST payment", detail: `Tax for ${label}`, kind: "gst" });
    } else if (opts.gstFiling === "qrmp") {
      if (quarterEnd) {
        push({ date: iso(ny, nm, 13), title: "GSTR-1 (quarterly)", detail: `Quarter ending ${label}`, kind: "gst" });
        push({ date: iso(ny, nm, QRMP_24.has(opts.stateCode) ? 24 : 22), title: "GSTR-3B (quarterly)", detail: `Quarter ending ${label}`, kind: "gst" });
      } else {
        push({ date: iso(ny, nm, 25), title: "GST payment (PMT-06)", detail: `Tax for ${label}`, kind: "gst" });
      }
    }

    if (opts.tds) {
      push({ date: m === 3 ? iso(y, 4, 30) : iso(ny, nm, 7), title: "TDS deposit", detail: `TDS deducted in ${label}`, kind: "tds" });
    }
  }

  for (let y = fy - 1; y <= fy + 2; y++) {
    if (opts.tds) {
      push({ date: iso(y, 7, 31), title: "TDS return 26Q", detail: "Apr–Jun quarter", kind: "tds" });
      push({ date: iso(y, 10, 31), title: "TDS return 26Q", detail: "Jul–Sep quarter", kind: "tds" });
      push({ date: iso(y, 1, 31), title: "TDS return 26Q", detail: "Oct–Dec quarter", kind: "tds" });
      push({ date: iso(y, 5, 31), title: "TDS return 26Q", detail: "Jan–Mar quarter", kind: "tds" });
    }
    if (opts.gstFiling !== "none") {
      push({ date: iso(y, 11, 30), title: "Last date to claim GST input credit", detail: `Bills of FY ${String(y - 1).slice(2)}-${String(y).slice(2)}`, kind: "gst" });
      push({ date: iso(y, 12, 31), title: "GSTR-9 annual return", detail: "If turnover is over ₹2 Cr", kind: "gst" });
    }
    for (const [mm, dd, part] of [
      [6, 15, "15%"],
      [9, 15, "45%"],
      [12, 15, "75%"],
      [3, 15, "100%"],
    ] as const) {
      push({ date: iso(y, mm, dd), title: "Advance tax", detail: `${part} of the year's tax`, kind: "income_tax" });
    }
    push({ date: iso(y, 7, 31), title: "Income tax return", detail: "If no tax audit", kind: "income_tax" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Next items from today, for dashboards. */
export function upcoming(today: string, days: number, opts: Parameters<typeof dueDates>[2]) {
  return dueDates(today, addDays(today, days), opts);
}
