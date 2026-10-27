import { OUTSIDE_INDIA, STATES } from "./gst";
import { round2 } from "./money";
import type { DocumentRecord } from "./types";

/**
 * GSTR-1 sections in the column layout of the GST offline tool's CSV templates.
 * All values in INR (export invoices use the exchange rate stored on the invoice).
 * Review with your CA before filing: this is a preparation aid, not a filing.
 */

/** Inter-state B2C invoices above this value go to B2CL (₹1 lakh from 1 Aug 2024). */
export const B2CL_THRESHOLD = 100000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const gstDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
};
const pos = (code: string) => (STATES[code] ? `${code}-${STATES[code]}` : code);
const inr = (d: DocumentRecord, n: number) => round2(d.currency === "INR" ? n : n * (d.fx_rate || 1));

export type Row = Record<string, string | number>;

const live = (d: DocumentRecord) => d.status !== "draft" && d.status !== "awaiting_approval" && d.status !== "cancelled";
const isExport = (d: DocumentRecord) => d.place_of_supply === OUTSIDE_INDIA || d.export_type !== "none";

export function b2b(docs: DocumentRecord[]): Row[] {
  return docs
    .filter((d) => d.doc_type === "invoice" && live(d) && d.client.gstin && !isExport(d))
    .map((d) => ({
      "GSTIN/UIN of Recipient": d.client.gstin,
      "Receiver Name": d.client.name,
      "Invoice Number": d.number ?? "",
      "Invoice date": gstDate(d.issue_date),
      "Invoice Value": inr(d, d.total),
      "Place Of Supply": pos(d.place_of_supply),
      "Reverse Charge": d.reverse_charge ? "Y" : "N",
      "Applicable % of Tax Rate": "",
      "Invoice Type": "Regular B2B",
      "E-Commerce GSTIN": "",
      Rate: d.gst_rate,
      "Taxable Value": inr(d, d.taxable),
      "Cess Amount": 0,
    }));
}

export function b2cl(docs: DocumentRecord[], supplierState: string): Row[] {
  return docs
    .filter((d) => d.doc_type === "invoice" && live(d) && !d.client.gstin && !isExport(d) && d.place_of_supply !== supplierState && inr(d, d.total) > B2CL_THRESHOLD)
    .map((d) => ({
      "Invoice Number": d.number ?? "",
      "Invoice date": gstDate(d.issue_date),
      "Invoice Value": inr(d, d.total),
      "Place Of Supply": pos(d.place_of_supply),
      "Applicable % of Tax Rate": "",
      Rate: d.gst_rate,
      "Taxable Value": inr(d, d.taxable),
      "Cess Amount": 0,
      "E-Commerce GSTIN": "",
    }));
}

export function b2cs(docs: DocumentRecord[], supplierState: string): Row[] {
  const groups = new Map<string, Row>();
  for (const d of docs) {
    if (d.doc_type !== "invoice" || !live(d) || d.client.gstin || isExport(d)) continue;
    if (d.place_of_supply !== supplierState && inr(d, d.total) > B2CL_THRESHOLD) continue; // that's B2CL
    const key = `${d.place_of_supply}|${d.gst_rate}`;
    const row = groups.get(key) ?? { Type: "OE", "Place Of Supply": pos(d.place_of_supply), "Applicable % of Tax Rate": "", Rate: d.gst_rate, "Taxable Value": 0, "Cess Amount": 0, "E-Commerce GSTIN": "" };
    row["Taxable Value"] = round2(Number(row["Taxable Value"]) + inr(d, d.taxable));
    groups.set(key, row);
  }
  return [...groups.values()];
}

export function exp(docs: DocumentRecord[]): Row[] {
  return docs
    .filter((d) => d.doc_type === "invoice" && live(d) && isExport(d))
    .map((d) => ({
      "Export Type": d.export_type === "igst" ? "WPAY" : "WOPAY",
      "Invoice Number": d.number ?? "",
      "Invoice date": gstDate(d.issue_date),
      "Invoice Value": inr(d, d.total),
      "Port Code": "",
      "Shipping Bill Number": "",
      "Shipping Bill Date": "",
      Rate: d.export_type === "igst" ? d.gst_rate : 0,
      "Taxable Value": inr(d, d.taxable),
      "Cess Amount": 0,
    }));
}

export function cdnr(docs: DocumentRecord[]): Row[] {
  return docs
    .filter((d) => d.doc_type === "credit_note" && live(d) && d.client.gstin)
    .map((d) => ({
      "GSTIN/UIN of Recipient": d.client.gstin,
      "Receiver Name": d.client.name,
      "Note Number": d.number ?? "",
      "Note Date": gstDate(d.issue_date),
      "Note Type": "C",
      "Place Of Supply": pos(d.place_of_supply),
      "Reverse Charge": d.reverse_charge ? "Y" : "N",
      "Note Supply Type": "Regular B2B",
      "Note Value": inr(d, d.total),
      "Applicable % of Tax Rate": "",
      Rate: d.gst_rate,
      "Taxable Value": inr(d, d.taxable),
      "Cess Amount": 0,
    }));
}

/** Table 12: HSN/SAC summary, split B2B (recipient has GSTIN) vs B2C. Tax is allocated to lines pro rata. */
export function hsn(docs: DocumentRecord[], kind: "b2b" | "b2c"): Row[] {
  const groups = new Map<string, Row>();
  for (const d of docs) {
    if (d.doc_type !== "invoice" || !live(d)) continue;
    if ((kind === "b2b") !== Boolean(d.client.gstin)) continue;
    const lineTotal = d.items.reduce((s, i) => s + i.qty * i.unit_price, 0) || 1;
    for (const item of d.items) {
      const share = (item.qty * item.unit_price) / lineTotal;
      const sac = item.sac || "998391";
      const key = `${sac}|${d.gst_rate}`;
      const row = groups.get(key) ?? {
        HSN: sac, Description: item.title.slice(0, 30), UQC: "NA", "Total Quantity": 0, "Total Value": 0, Rate: d.gst_rate,
        "Taxable Value": 0, "Integrated Tax Amount": 0, "Central Tax Amount": 0, "State/UT Tax Amount": 0, "Cess Amount": 0,
      };
      const add = (k: string, v: number) => (row[k] = round2(Number(row[k]) + inr(d, v * share)));
      add("Total Value", d.total);
      add("Taxable Value", d.taxable);
      add("Integrated Tax Amount", d.igst);
      add("Central Tax Amount", d.cgst);
      add("State/UT Tax Amount", d.sgst);
      groups.set(key, row);
    }
  }
  return [...groups.values()];
}

const NATURE: Partial<Record<DocumentRecord["doc_type"], string>> = {
  invoice: "Invoices for outward supply",
  receipt: "Receipt Voucher",
  credit_note: "Credit Note",
};

/** Table 13: documents issued, per series (prefix + FY), with cancelled counts. */
export function docSeries(docs: DocumentRecord[]): Row[] {
  const groups = new Map<string, { nature: string; numbers: string[]; cancelled: number }>();
  for (const d of docs) {
    const nature = NATURE[d.doc_type];
    if (!nature || !d.number || d.status === "draft" || d.status === "awaiting_approval") continue;
    const series = d.number.replace(/\d+$/, "");
    const key = `${nature}|${series}`;
    const g = groups.get(key) ?? { nature, numbers: [], cancelled: 0 };
    g.numbers.push(d.number);
    if (d.status === "cancelled") g.cancelled++;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const sorted = g.numbers.sort();
    return { "Nature of Document": g.nature, "Sr. No. From": sorted[0], "Sr. No. To": sorted.at(-1)!, "Total Number": sorted.length, Cancelled: g.cancelled };
  });
}

export const GSTR1_SECTIONS = {
  b2b: "B2B invoices (clients with GSTIN)",
  b2cl: "B2C large (inter-state, over ₹1 lakh)",
  b2cs: "B2C small (summary by place of supply)",
  exp: "Exports",
  cdnr: "Credit notes to registered clients",
  hsn_b2b: "HSN/SAC summary: B2B (Table 12)",
  hsn_b2c: "HSN/SAC summary: B2C (Table 12)",
  docs: "Documents issued (Table 13)",
} as const;

export type Gstr1Section = keyof typeof GSTR1_SECTIONS;

export function gstr1Section(section: Gstr1Section, docs: DocumentRecord[], supplierState: string): Row[] {
  switch (section) {
    case "b2b": return b2b(docs);
    case "b2cl": return b2cl(docs, supplierState);
    case "b2cs": return b2cs(docs, supplierState);
    case "exp": return exp(docs);
    case "cdnr": return cdnr(docs);
    case "hsn_b2b": return hsn(docs, "b2b");
    case "hsn_b2c": return hsn(docs, "b2c");
    case "docs": return docSeries(docs);
  }
}

export function toCsv(rows: Row[], headers?: string[]): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(esc).join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
