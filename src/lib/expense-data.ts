import "server-only";
import { requireTeam } from "./data";
import type { ExpenseKind, Gstr2b, ItcStatus } from "./expenses";
import { financialYear } from "./money";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export interface Category {
  id: string;
  name: string;
  itc_rule: "eligible" | "blocked" | "none";
  kind: "overhead" | "pass_through";
  tds_nature: string;
  rcm: boolean;
  budget_month: number;
  sort: number;
  active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  kind: string;
  gstin: string;
  pan: string;
  state_code: string;
  email: string;
  phone: string;
  address: string;
  bank_details: string;
  upi_id: string;
  default_category_id: string | null;
  tds_nature: string;
  is_company: boolean;
  msme: boolean;
  notes: string;
}

export interface Expense {
  id: string;
  kind: ExpenseKind;
  vendor_id: string | null;
  vendor_name: string;
  category_id: string;
  expense_date: string;
  bill_no: string;
  description: string;
  project_id: string | null;
  client_id: string | null;
  currency: string;
  fx_rate: number;
  taxable: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  rcm: boolean;
  total: number;
  itc_status: ItcStatus;
  gstr2b: Gstr2b;
  itc_month: string | null;
  tds_nature: string;
  tds_rate: number;
  tds_amount: number;
  tds_challan_id: string | null;
  paid_from: "bank" | "petty_cash" | "member";
  paid_by_email: string | null;
  approval: "submitted" | "approved" | "rejected" | null;
  approval_note: string;
  due_date: string | null;
  billable: boolean;
  markup_pct: number;
  invoiced_document_id: string | null;
  recurring: { every: "month" | "quarter" | "year"; next: string } | null;
  is_draft: boolean;
  receipt_path: string | null;
  receipt_name: string;
  notes: string;
  created_by: string;
  created_at: string;
  // joined
  category: string;
  category_kind: "overhead" | "pass_through";
  vendor: string;
  vendor_gstin: string;
  project_code: string;
  payable: number;
  paid: number;
  balance: number;
  last_paid_on: string | null;
}

export function toExpense(r: Row, bal?: Row): Expense {
  const c = r.expense_categories as { name: string; kind: Expense["category_kind"] } | null;
  const v = r.vendors as { name: string; gstin: string } | null;
  const p = r.projects as { code: string } | null;
  const total = n(r.total);
  const tds = n(r.tds_amount);
  return {
    ...(r as unknown as Expense),
    fx_rate: n(r.fx_rate) || 1,
    taxable: n(r.taxable),
    gst_rate: n(r.gst_rate),
    cgst: n(r.cgst),
    sgst: n(r.sgst),
    igst: n(r.igst),
    total,
    tds_rate: n(r.tds_rate),
    tds_amount: tds,
    markup_pct: n(r.markup_pct),
    category: c?.name ?? "",
    category_kind: c?.kind ?? "overhead",
    vendor: v?.name ?? (r.vendor_name as string) ?? "",
    vendor_gstin: v?.gstin ?? "",
    project_code: p?.code ?? "",
    payable: bal ? n(bal.payable) : Math.round((total - tds) * 100) / 100,
    paid: bal ? n(bal.paid) : 0,
    balance: bal ? n(bal.balance) : Math.round((total - tds) * 100) / 100,
    last_paid_on: (bal?.last_paid_on as string) ?? null,
  };
}

const SELECT = "*, expense_categories(name, kind), vendors(name, gstin), projects(code)";

export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string;
  vendor?: string;
  project?: string;
  kind?: string;
  status?: string; // unpaid | paid | submitted | approved | rejected | draft
  q?: string;
}

export async function listExpenses(f: ExpenseFilters = {}, limit = 1000): Promise<Expense[]> {
  const { supabase } = await requireTeam();
  let q = supabase.from("expenses").select(SELECT).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("expense_date", f.from);
  if (f.to) q = q.lte("expense_date", f.to);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.vendor) q = q.eq("vendor_id", f.vendor);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status && ["submitted", "approved", "rejected"].includes(f.status)) q = q.eq("approval", f.status);
  if (f.status === "draft") q = q.eq("is_draft", true);
  if (f.q) {
    const s = f.q.replace(/[%,()*]/g, " ").trim();
    if (s) q = q.or(`description.ilike.%${s}%,vendor_name.ilike.%${s}%,bill_no.ilike.%${s}%`);
  }
  const [{ data }, { data: bals }] = await Promise.all([q, supabase.from("expense_balances").select("*")]);
  const byId = new Map(((bals ?? []) as Row[]).map((b) => [b.expense_id as string, b]));
  let list = ((data ?? []) as Row[]).map((r) => toExpense(r, byId.get(r.id as string)));
  if (f.status === "unpaid") list = list.filter((e) => e.balance > 0.005 && e.approval !== "rejected");
  if (f.status === "paid") list = list.filter((e) => e.balance <= 0.005);
  return list;
}

export async function getExpense(id: string) {
  const { supabase } = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [{ data }, { data: bal }, { data: payments }] = await Promise.all([
    supabase.from("expenses").select(SELECT).eq("id", id).maybeSingle(),
    supabase.from("expense_balances").select("*").eq("expense_id", id).maybeSingle(),
    supabase.from("expense_payments").select("*, bank_accounts(label)").eq("expense_id", id).order("paid_on"),
  ]);
  if (!data) return null;
  return {
    expense: toExpense(data as Row, bal as Row),
    payments: ((payments ?? []) as Row[]).map((p) => ({
      id: p.id as string,
      paid_on: p.paid_on as string,
      amount: n(p.amount),
      mode: p.mode as string,
      reference: p.reference as string,
      account: (p.bank_accounts as { label: string } | null)?.label ?? "",
    })),
  };
}

export async function listCategories(): Promise<Category[]> {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("expense_categories").select("*").order("sort").order("name");
  return ((data ?? []) as Row[]).map((c) => ({ ...(c as unknown as Category), budget_month: n(c.budget_month) }));
}

export async function listVendors(): Promise<Vendor[]> {
  const { supabase, isStaff } = await requireTeam();
  if (!isStaff) return [];
  const { data } = await supabase.from("vendors").select("*").order("name");
  return (data ?? []) as Vendor[];
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const { supabase } = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
  return (data as Vendor) ?? null;
}

/** Taxable value billed by a vendor so far in the financial year of `date` (and its month), for TDS limits. */
export async function vendorTotals(vendorId: string, date: string, excludeId?: string) {
  const { supabase } = await requireTeam();
  const fy = financialYear(date);
  const start = `20${fy.slice(0, 2)}-04-01`;
  const end = `20${fy.slice(3)}-03-31`;
  let q = supabase.from("expenses").select("id, taxable, expense_date").eq("vendor_id", vendorId).gte("expense_date", start).lte("expense_date", end);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  return {
    year: rows.reduce((s, r) => s + n(r.taxable), 0),
    month: rows.filter((r) => String(r.expense_date).slice(0, 7) === date.slice(0, 7)).reduce((s, r) => s + n(r.taxable), 0),
  };
}

export async function listChallans() {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("tds_challans").select("*").order("month", { ascending: false });
  return ((data ?? []) as Row[]).map((c) => ({ id: c.id as string, month: c.month as string, amount: n(c.amount), challan_no: c.challan_no as string, bsr_code: c.bsr_code as string, paid_on: c.paid_on as string }));
}

export async function cashAccounts() {
  const { supabase } = await requireTeam();
  const { data } = await supabase.from("bank_accounts").select("id, label, kind, opening_balance, opening_date").order("kind").order("label");
  return ((data ?? []) as Row[]).map((a) => ({ id: a.id as string, label: a.label as string, kind: a.kind as "bank" | "cash", opening_balance: n(a.opening_balance), opening_date: (a.opening_date as string) ?? null }));
}
