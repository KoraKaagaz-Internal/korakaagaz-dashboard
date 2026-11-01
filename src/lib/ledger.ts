import { inr } from "./reports";
import { round2 } from "./money";
import { DOC_LABELS, type DocumentRecord } from "./types";

export interface LedgerRow {
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  docId?: string;
}

/** Client statement: invoices debit, payments/TDS/credit notes credit, running balance in INR. */
export function buildLedger(docs: DocumentRecord[], payments: Record<string, unknown>[], from?: string, to?: string) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const entries: Omit<LedgerRow, "balance">[] = [];
  for (const d of docs) {
    if (!["issued", "accepted"].includes(d.status)) continue;
    if (d.doc_type === "invoice") entries.push({ date: d.issue_date, particulars: `${DOC_LABELS.invoice.short} ${d.number}`, debit: inr(d, d.total), credit: 0, docId: d.id });
    if (d.doc_type === "credit_note") entries.push({ date: d.issue_date, particulars: `Credit note ${d.number}`, debit: 0, credit: inr(d, d.total), docId: d.id });
  }
  for (const p of payments) {
    const d = byId.get(String(p.document_id));
    if (!d) continue;
    const ref = p.mode === "advance" ? `advance ${p.reference}` : `${String(p.mode).toUpperCase()}${p.reference ? ` ${p.reference}` : ""}`;
    entries.push({ date: String(p.paid_on), particulars: `Payment for ${d.number} · ${ref}`, debit: 0, credit: inr(d, Number(p.amount)), docId: d.id });
    if (Number(p.tds_amount) > 0)
      entries.push({
        date: String(p.paid_on),
        particulars: `TDS deducted on ${d.number}${p.tds_section ? ` (${p.tds_section})` : ""}`,
        debit: 0,
        credit: inr(d, Number(p.tds_amount)),
        docId: d.id,
      });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);

  let opening = 0;
  const rows: LedgerRow[] = [];
  let running = 0;
  for (const e of entries) {
    if (from && e.date < from) {
      opening = round2(opening + e.debit - e.credit);
      running = opening;
      continue;
    }
    if (to && e.date > to) continue;
    running = round2(running + e.debit - e.credit);
    rows.push({ ...e, balance: running });
  }
  return { opening, rows, closing: running };
}
