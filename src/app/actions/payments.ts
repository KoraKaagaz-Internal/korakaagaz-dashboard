"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/data";

const paymentSchema = z.object({
  document_id: z.string().uuid(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().min(0),
  tds_amount: z.coerce.number().min(0),
  tds_section: z.string().trim(),
  mode: z.enum(["upi", "bank", "cash", "cheque", "card", "wire", "other", "advance"]),
  reference: z.string().trim(),
  note: z.string().trim(),
  /** one per "Record" click, so a double-click or retry can't save twice */
  request_id: z.string().uuid().optional(),
});

export type PaymentInput = z.input<typeof paymentSchema>;

export async function recordPayment(input: PaymentInput) {
  const { supabase } = await requireMember("admin");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues.map((i) => i.message).join(", ") };
  const p = parsed.data;
  if (p.amount + p.tds_amount <= 0) return { ok: false as const, message: "Enter an amount" };

  const { data: doc } = await supabase.from("documents").select("doc_type, status").eq("id", p.document_id).single();
  if (!doc || !["invoice", "proforma"].includes(doc.doc_type) || doc.status !== "issued") {
    return { ok: false as const, message: "Payments can only be recorded on issued invoices" };
  }
  const { data: bal } = await supabase.from("document_balances").select("balance").eq("id", p.document_id).single();
  if (bal && p.amount + p.tds_amount > Number(bal.balance) + 0.01) {
    return { ok: false as const, message: `That's more than the balance due (${Number(bal.balance).toFixed(2)})` };
  }
  const { error } = await supabase.from("payments").insert(p);
  // 23505 on request_id: this exact click was already saved
  if (error && !(error.code === "23505" && p.request_id)) return { ok: false as const, message: error.message };
  revalidatePath(`/documents/${p.document_id}`);
  revalidatePath("/documents");
  revalidatePath("/payments");
  return { ok: true as const };
}

export async function deletePayment(id: string, documentId: string) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/payments");
  return { ok: true as const };
}

/** Adjusts an advance (receipt voucher) against an invoice by recording it as a payment. */
export async function adjustAdvance(invoiceId: string, receiptId: string, amount: number) {
  const { supabase } = await requireMember("admin");
  const { data: receipt } = await supabase.from("documents").select("number, total, issue_date, doc_type, status").eq("id", receiptId).single();
  if (!receipt || receipt.doc_type !== "receipt" || receipt.status !== "issued") return { ok: false as const, message: "Pick an issued receipt voucher" };
  const { data: used } = await supabase.from("payments").select("amount").eq("mode", "advance").eq("reference", receipt.number);
  const left = Number(receipt.total) - (used ?? []).reduce((s, p) => s + Number(p.amount), 0);
  if (amount > left + 0.01) return { ok: false as const, message: `Only ${left.toFixed(2)} of this advance is left` };
  return recordPayment({
    document_id: invoiceId,
    paid_on: String(receipt.issue_date),
    amount,
    tds_amount: 0,
    tds_section: "",
    mode: "advance",
    reference: String(receipt.number),
    note: "Advance adjusted",
  });
}
