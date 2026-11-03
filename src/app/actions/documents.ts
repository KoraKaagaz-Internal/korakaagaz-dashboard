"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSettings, listBankAccounts, requireMember, supplierSnapshot } from "@/lib/data";
import { copyDocumentToDraft, type CopyRelation } from "@/lib/doc-copy";
import { computeTotals, financialYear, isValidDocNumber, lineAmount } from "@/lib/money";
import type { DocType } from "@/lib/types";

const itemSchema = z.object({
  title: z.string().trim(),
  description: z.string().trim(),
  sac: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "SAC must be 4–8 digits"),
  qty: z.coerce.number().min(0),
  unit_price: z.coerce.number().min(0),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const documentSchema = z.object({
  id: z.string().uuid().optional(),
  doc_type: z.enum(["invoice", "quote", "proforma", "receipt", "credit_note"]),
  number: z.string().trim().nullable(),
  client_id: z.string().uuid().nullable(),
  client: z.object({
    name: z.string().trim().min(1, "Client name is required"),
    email: z.string().trim(),
    phone: z.string().trim(),
    address: z.string().trim(),
    city: z.string().trim(),
    pin: z.string().trim(),
    state_code: z.string().trim(),
    country: z.string().trim(),
    gstin: z.string().trim().toUpperCase(),
  }),
  bank_account_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  source_id: z.string().uuid().nullable(),
  source_relation: z.string().nullable(),
  issue_date: date,
  due_date: date.nullable(),
  valid_until: date.nullable(),
  currency: z.string().trim().length(3).toUpperCase(),
  fx_rate: z.coerce.number().positive(),
  place_of_supply: z.string().trim(),
  reverse_charge: z.boolean(),
  export_type: z.enum(["none", "lut", "igst"]),
  gst_mode: z.enum(["none", "cgst_sgst", "igst"]),
  gst_rate: z.coerce.number().min(0).max(28),
  discount_type: z.enum(["none", "flat", "percent"]),
  discount_value: z.coerce.number().min(0),
  round_off: z.boolean(),
  notes: z.string().trim(),
  terms: z.string().trim(),
  payment_terms: z.string().trim(),
  custom_fields: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).max(6),
  reminders_enabled: z.boolean(),
  recurring: z.object({ every: z.enum(["month", "quarter"]), next: date }).nullable(),
  items: z.array(itemSchema).min(1, "Add at least one line item"),
});

export type DocumentInput = z.input<typeof documentSchema>;
type Result = { ok: true; id: string; message?: string } | { ok: false; message: string };

const QUOTES_ONLY = "Members can make quotes; invoices and other documents are for the admin.";

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That number is already used for this document type and financial year.";
  if (error.code === "42501") return error.message.replace(/^.*?: /, "");
  return error.message;
}

export async function saveDocument(input: DocumentInput): Promise<Result> {
  const { supabase, isAdmin } = await requireMember("member");
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const d = parsed.data;
  if (!isAdmin && d.doc_type !== "quote") return { ok: false, message: QUOTES_ONLY };
  const items = d.items.filter((i) => i.title || i.description || i.unit_price);
  if (!items.length) return { ok: false, message: "Add at least one line item" };
  if (d.number && !isValidDocNumber(d.number)) return { ok: false, message: "Number: max 16 characters, letters, digits, / and - only" };

  const [settings, banks] = await Promise.all([getSettings(), listBankAccounts()]);
  const bank = banks.find((b) => b.id === d.bank_account_id) ?? banks.find((b) => b.is_default) ?? banks[0] ?? null;
  const totals = computeTotals({ ...d, items });

  const { id, items: _ignored, client, ...rest } = d;
  void _ignored;
  const row = {
    ...rest,
    number: d.number || null,
    fy: d.number ? financialYear(d.issue_date) : null,
    bank_account_id: bank?.id ?? null,
    client_snapshot: client,
    supplier_snapshot: supplierSnapshot(settings, bank),
    subtotal: totals.subtotal,
    discount_amount: totals.discount,
    taxable: totals.taxable,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    round_off_amount: totals.roundOff,
    total: totals.total,
  };

  let docId = id;
  if (docId) {
    const { error } = await supabase.from("documents").update(row).eq("id", docId);
    if (error) return { ok: false, message: friendly(error) };
    const { error: delErr } = await supabase.from("document_items").delete().eq("document_id", docId);
    if (delErr) return { ok: false, message: friendly(delErr) };
  } else {
    const { data, error } = await supabase
      .from("documents")
      .insert({ ...row, status: "draft" })
      .select("id")
      .single();
    if (error) return { ok: false, message: friendly(error) };
    docId = data.id as string;
  }

  const { error: itemsErr } = await supabase.from("document_items").insert(items.map((item, position) => ({ ...item, document_id: docId, position, amount: lineAmount(item) })));
  if (itemsErr) return { ok: false, message: friendly(itemsErr) };

  revalidatePath("/documents");
  return { ok: true, id: docId! };
}

/** Issue = assign the next number and lock. Members may need admin approval first (Settings). */
export async function issueDocument(id: string): Promise<Result> {
  const { supabase, role } = await requireMember("member");
  const [{ data: doc }, settings, banks] = await Promise.all([
    supabase.from("documents").select("id, doc_type, status, number, issue_date, bank_account_id").eq("id", id).single(),
    getSettings(),
    listBankAccounts(),
  ]);
  if (!doc) return { ok: false, message: "Document not found" };
  if (doc.status !== "draft" && doc.status !== "awaiting_approval") return { ok: false, message: "Already issued" };

  if (settings.require_approval && role !== "admin") {
    if (doc.status === "awaiting_approval") return { ok: false, message: "Waiting for the admin to approve" };
    const { error } = await supabase.from("documents").update({ status: "awaiting_approval" }).eq("id", id);
    if (error) return { ok: false, message: friendly(error) };
    revalidatePath(`/documents/${id}`);
    return { ok: true, id, message: "Sent to the admin for approval" };
  }

  let number = doc.number as string | null;
  if (!number) {
    const { data, error } = await supabase.rpc("next_doc_number", { p_type: doc.doc_type, p_date: doc.issue_date });
    if (error) return { ok: false, message: friendly(error) };
    number = data as string;
  }
  const bank = banks.find((b) => b.id === doc.bank_account_id) ?? banks.find((b) => b.is_default) ?? null;
  const { error } = await supabase
    .from("documents")
    .update({
      status: "issued",
      number,
      fy: financialYear(String(doc.issue_date)),
      issued_at: new Date().toISOString(),
      supplier_snapshot: supplierSnapshot(settings, bank),
    })
    .eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
  return { ok: true, id, message: `Issued as ${number}` };
}

export async function sendBackToDraft(id: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("documents").update({ status: "draft" }).eq("id", id).eq("status", "awaiting_approval");
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

export async function cancelDocument(id: string): Promise<Result> {
  const { supabase, isAdmin } = await requireMember("member");
  if (!isAdmin) {
    const { data } = await supabase.from("documents").select("doc_type").eq("id", id).maybeSingle();
    if (data?.doc_type !== "quote") return { ok: false, message: QUOTES_ONLY };
  }
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("document_id", id);
  if (count) return { ok: false, message: "This document has payments. Delete them first, or issue a credit note instead." };
  const { error } = await supabase.from("documents").update({ status: "cancelled", reminders_enabled: false, recurring: null }).eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

export async function setQuoteOutcome(id: string, outcome: "accepted" | "declined", reason = ""): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase
    .from("documents")
    .update({ status: outcome, accepted_at: outcome === "accepted" ? new Date().toISOString() : null, lost_reason: outcome === "declined" ? reason : "" })
    .eq("id", id)
    .eq("doc_type", "quote");
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

async function copyToDraft(sourceId: string, opts: { doc_type?: DocType; relation: CopyRelation }): Promise<Result> {
  const { supabase } = await requireMember("member");
  const settings = await getSettings();
  const result = await copyDocumentToDraft(supabase, sourceId, { ...opts, dueDays: settings.default_due_days, terms: settings.terms });
  if (result.ok) revalidatePath("/documents");
  return result;
}

export async function convertDocument(id: string, to: "invoice" | "proforma") {
  const { supabase } = await requireMember("admin");
  const result = await copyToDraft(id, { doc_type: to, relation: "converted_from" });
  if (!result.ok) return result;
  // Converting a quote counts as winning it.
  await supabase.from("documents").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", id).eq("doc_type", "quote").eq("status", "issued");
  redirect(`/documents/${result.id}/edit`);
}

export async function createCreditNote(invoiceId: string) {
  await requireMember("admin");
  const result = await copyToDraft(invoiceId, { doc_type: "credit_note", relation: "credit_for" });
  if (!result.ok) return result;
  redirect(`/documents/${result.id}/edit`);
}

export async function duplicateDocument(id: string) {
  const result = await copyToDraft(id, { relation: "duplicated_from" });
  if (!result.ok) return result;
  redirect(`/documents/${result.id}/edit`);
}

export async function reviseQuote(id: string) {
  const result = await copyToDraft(id, { relation: "revision_of" });
  if (!result.ok) return result;
  redirect(`/documents/${result.id}/edit`);
}

export async function deleteDraft(id: string) {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("documents").delete().eq("id", id).in("status", ["draft", "awaiting_approval"]);
  if (error) return { ok: false as const, message: friendly(error) };
  revalidatePath("/documents");
  redirect("/documents");
}

export async function setShare(id: string, enabled: boolean, rotate = false): Promise<Result> {
  const { supabase } = await requireMember("member");
  const patch: Record<string, unknown> = { share_enabled: enabled };
  if (rotate) patch.share_token = randomBytes(16).toString("hex");
  const { error } = await supabase.from("documents").update(patch).eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

export async function setReminders(id: string, enabled: boolean): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("documents").update({ reminders_enabled: enabled }).eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}

export async function setRecurring(id: string, every: "month" | "quarter" | null, next: string | null): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const recurring = every && next ? { every, next } : null;
  const { error } = await supabase.from("documents").update({ recurring }).eq("id", id);
  if (error) return { ok: false, message: friendly(error) };
  revalidatePath(`/documents/${id}`);
  return { ok: true, id };
}
