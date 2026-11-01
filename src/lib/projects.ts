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
