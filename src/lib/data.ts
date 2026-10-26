import "server-only";
import { redirect } from "next/navigation";
import { getUser } from "./supabase/server";
import type { Client, Invoice, InvoiceStatus, PaymentSnapshot, Settings } from "./types";

/** Supabase client for the signed-in owner; redirects to /login otherwise. */
export async function requireOwner() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export const DEFAULT_SETTINGS: Omit<Settings, "owner_id"> = {
  business_name: "Kora Kaagaz",
  upi_id: "",
  bank_account_no: "",
  bank_ifsc: "",
  bank_address: "",
  pan: "",
  gstin: "",
  query_email: "",
  query_phone: "",
  invoice_prefix: "KK",
  next_number: 1,
  default_currency: "INR",
  default_payment_terms: "100% Final Payment",
  default_gst_mode: "none",
  default_gst_rate: 18,
};

export async function getSettings(): Promise<Settings> {
  const { supabase, user } = await requireOwner();
  const { data } = await supabase.from("settings").select("*").eq("owner_id", user.id).maybeSingle();
  return { ...DEFAULT_SETTINGS, owner_id: user.id, ...(data ?? {}), default_gst_rate: Number(data?.default_gst_rate ?? 18) };
}

export function paymentSnapshot(s: Settings): PaymentSnapshot {
  return {
    business_name: s.business_name,
    upi_id: s.upi_id,
    bank_account_no: s.bank_account_no,
    bank_ifsc: s.bank_ifsc,
    bank_address: s.bank_address,
    pan: s.pan,
    gstin: s.gstin,
    query_email: s.query_email,
    query_phone: s.query_phone,
  };
}

export async function listClients(): Promise<Client[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from("clients").select("id,name,address,gstin,email,phone").order("name");
  if (error) throw error;
  return data ?? [];
}

type InvoiceRow = Record<string, unknown> & {
  invoice_items?: Record<string, unknown>[];
};

function toInvoice(row: InvoiceRow): Invoice {
  const items = [...(row.invoice_items ?? [])]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((i) => ({
      title: String(i.title ?? ""),
      description: String(i.description ?? ""),
      qty: Number(i.qty),
      unit_price: Number(i.unit_price),
    }));
  const n = (k: string) => Number(row[k] ?? 0);
  return {
    id: String(row.id),
    number: String(row.number),
    client_id: (row.client_id as string) ?? null,
    client: { name: "", address: "", gstin: "", email: "", phone: "", ...(row.client_snapshot as object) },
    payment: row.payment_snapshot as PaymentSnapshot,
    issue_date: String(row.issue_date),
    due_date: (row.due_date as string) ?? null,
    currency: String(row.currency),
    payment_terms: String(row.payment_terms ?? ""),
    discount_type: row.discount_type as Invoice["discount_type"],
    discount_value: n("discount_value"),
    gst_mode: row.gst_mode as Invoice["gst_mode"],
    gst_rate: n("gst_rate"),
    notes: String(row.notes ?? ""),
    status: row.status as InvoiceStatus,
    paid_at: (row.paid_at as string) ?? null,
    pdf_path: (row.pdf_path as string) ?? null,
    subtotal: n("subtotal"),
    discount_amount: n("discount_amount"),
    tax_amount: n("tax_amount"),
    total: n("total"),
    created_at: String(row.created_at),
    items,
  };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toInvoice(data) : null;
}

export interface InvoiceFilters {
  q?: string;
  status?: InvoiceStatus | "";
  from?: string;
  to?: string;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  const { supabase } = await requireOwner();
  let query = supabase.from("invoices").select("*").order("issue_date", { ascending: false }).order("number", { ascending: false });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.q) {
    // strip characters that would break PostgREST's or() syntax
    const q = filters.q.replace(/[%,()*]/g, " ").trim();
    if (q) query = query.or(`number.ilike.%${q}%,client_snapshot->>name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toInvoice);
}
