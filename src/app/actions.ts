"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSettings, getInvoice, paymentSnapshot, requireOwner } from "@/lib/data";
import { computeTotals, lineAmount, todayIso } from "@/lib/money";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function sendMagicLink(_: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const email = String(formData.get("email") ?? "").trim();
  // Same message either way, so the form doesn't reveal which email is allowed.
  const message = "If that email is allowed, a sign-in link is on its way.";
  if (!isAllowedEmail(email)) return { ok: true, message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  business_name: z.string().trim().min(1),
  upi_id: z.string().trim(),
  bank_account_no: z.string().trim(),
  bank_ifsc: z.string().trim().toUpperCase(),
  bank_address: z.string().trim(),
  pan: z.string().trim().toUpperCase(),
  gstin: z.string().trim().toUpperCase(),
  query_email: z.string().trim(),
  query_phone: z.string().trim(),
  invoice_prefix: z.string().trim().min(1).max(10),
  next_number: z.coerce.number().int().positive(),
  default_currency: z.string().trim().min(1).max(5),
  default_payment_terms: z.string().trim(),
  default_gst_mode: z.enum(["none", "cgst_sgst", "igst"]),
  default_gst_rate: z.coerce.number().min(0).max(100),
});

export async function saveSettings(_: unknown, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireOwner();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join(", ") };
  const { error } = await supabase.from("settings").upsert({ owner_id: user.id, ...parsed.data });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.string().trim().default(""),
  gstin: z.string().trim().toUpperCase().default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
});

export async function saveClient(input: z.input<typeof clientSchema> & { id?: string }) {
  const { supabase } = await requireOwner();
  const data = clientSchema.parse(input);
  const query = input.id
    ? supabase.from("clients").update(data).eq("id", input.id).select("id,name,address,gstin,email,phone").single()
    : supabase.from("clients").insert(data).select("id,name,address,gstin,email,phone").single();
  const { data: row, error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  return row;
}

export async function deleteClient(id: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/clients");
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
const itemSchema = z.object({
  title: z.string().trim(),
  description: z.string().trim(),
  qty: z.coerce.number().min(0),
  unit_price: z.coerce.number().min(0),
});

const invoiceSchema = z.object({
  id: z.string().uuid().optional(),
  number: z.string().trim().optional(),
  client_id: z.string().uuid().nullable(),
  client: clientSchema,
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().trim().min(1).max(5),
  payment_terms: z.string().trim(),
  discount_type: z.enum(["none", "flat", "percent"]),
  discount_value: z.coerce.number().min(0),
  gst_mode: z.enum(["none", "cgst_sgst", "igst"]),
  gst_rate: z.coerce.number().min(0).max(100),
  notes: z.string().trim(),
  items: z.array(itemSchema).min(1, "Add at least one line item"),
});

export type InvoiceInput = z.input<typeof invoiceSchema>;

export async function saveInvoice(input: InvoiceInput): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireOwner();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const inv = parsed.data;
  const items = inv.items.filter((i) => i.title || i.description || i.unit_price);
  if (!items.length) return { error: "Add at least one line item" };

  const totals = computeTotals({ ...inv, items });
  const fields = {
    client_id: inv.client_id,
    client_snapshot: inv.client,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    currency: inv.currency,
    payment_terms: inv.payment_terms,
    discount_type: inv.discount_type,
    discount_value: inv.discount_value,
    gst_mode: inv.gst_mode,
    gst_rate: inv.gst_rate,
    notes: inv.notes,
    subtotal: totals.subtotal,
    discount_amount: totals.discount,
    tax_amount: totals.tax,
    total: totals.total,
  };

  let id = inv.id;
  if (id) {
    const patch: Record<string, unknown> = { ...fields };
    if (inv.number) patch.number = inv.number;
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) return { error: error.code === "23505" ? `Invoice number ${inv.number} already exists` : error.message };
    const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
    if (delErr) return { error: delErr.message };
  } else {
    const settings = await getSettings();
    let number = inv.number;
    if (!number) {
      const { data, error } = await supabase.rpc("next_invoice_number");
      if (error) return { error: error.message };
      number = data as string;
    }
    const { data, error } = await supabase
      .from("invoices")
      .insert({ ...fields, number, payment_snapshot: paymentSnapshot(settings) })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? `Invoice number ${number} already exists` : error.message };
    id = data.id as string;
  }

  const { error: itemsErr } = await supabase.from("invoice_items").insert(
    items.map((item, position) => ({ ...item, invoice_id: id, owner_id: user.id, position, amount: lineAmount(item) })),
  );
  if (itemsErr) return { error: itemsErr.message };

  revalidatePath("/invoices");
  return { id };
}

/** Refreshes an invoice's payment details from current Settings (they are snapshotted at creation). */
export async function refreshPaymentDetails(id: string) {
  const { supabase } = await requireOwner();
  const settings = await getSettings();
  const { error } = await supabase.from("invoices").update({ payment_snapshot: paymentSnapshot(settings) }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${id}`);
}

export async function setInvoiceStatus(id: string, status: "draft" | "sent" | "paid") {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("invoices")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
}

export async function duplicateInvoice(id: string) {
  const source = await getInvoice(id);
  if (!source) throw new Error("Invoice not found");
  const result = await saveInvoice({
    client_id: source.client_id,
    client: source.client,
    issue_date: todayIso(),
    due_date: null,
    currency: source.currency,
    payment_terms: source.payment_terms,
    discount_type: source.discount_type,
    discount_value: source.discount_value,
    gst_mode: source.gst_mode,
    gst_rate: source.gst_rate,
    notes: source.notes,
    items: source.items,
  });
  if (result.error) throw new Error(result.error);
  redirect(`/invoices/${result.id}/edit`);
}

export async function deleteInvoice(id: string) {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from("invoices").select("pdf_path").eq("id", id).maybeSingle();
  if (data?.pdf_path) await supabase.storage.from("invoices").remove([data.pdf_path]);
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
}
