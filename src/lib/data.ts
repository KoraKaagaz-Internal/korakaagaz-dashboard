import "server-only";
import { redirect } from "next/navigation";
import { DEFAULT_BOOKING } from "./crm";
import { getUser } from "./supabase/server";
import type {
  AuditEvent,
  Balance,
  BankAccount,
  CatalogItem,
  Client,
  DocStatus,
  DocType,
  DocumentRecord,
  Member,
  Payment,
  Project,
  Role,
  Settings,
  SupplierSnapshot,
} from "./types";

const RANK: Record<Role, number> = { freelancer: -1, viewer: 0, member: 1, admin: 2 };

/**
 * Signed-in staff member (admin, member, viewer) with at least `min` role; otherwise redirect.
 * Freelancers never pass: they only get the project pages (see requireTeam).
 */
export async function requireMember(min: Exclude<Role, "freelancer"> = "viewer") {
  const { supabase, user, role } = await getUser();
  if (!user || !role) redirect("/login");
  if (role === "freelancer") redirect("/my-work");
  if (RANK[role] < RANK[min]) redirect("/?denied=1");
  return { supabase, user, role, email: (user.email ?? "").toLowerCase(), canEdit: RANK[role] >= RANK.member, isAdmin: role === "admin" };
}

/** Anyone on the team, freelancers included. RLS limits freelancers to their projects. */
export async function requireTeam() {
  const { supabase, user, role } = await getUser();
  if (!user || !role) redirect("/login");
  return {
    supabase,
    user,
    role,
    email: (user.email ?? "").toLowerCase(),
    canEdit: RANK[role] >= RANK.member,
    isAdmin: role === "admin",
    isStaff: role !== "freelancer",
    /** Can change tasks (editors everywhere, freelancers on their projects). */
    canWork: role !== "viewer",
  };
}

export const DEFAULT_PREFIXES: Record<DocType, string> = { invoice: "KK", quote: "QT", proforma: "PI", receipt: "RV", credit_note: "CN" };

export async function getSettings(): Promise<Settings> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
  return {
    ...(data as Settings),
    prefixes: { ...DEFAULT_PREFIXES, ...(data?.prefixes ?? {}) },
    default_gst_rate: Number(data?.default_gst_rate ?? 18),
    terms: data?.terms ?? {},
    message_templates: data?.message_templates ?? {},
    booking: { ...DEFAULT_BOOKING, ...(data?.booking ?? {}) },
    enquiry_services: data?.enquiry_services ?? [],
    time_approval: !!data?.time_approval,
  };
}

/** Bank accounts for documents; `withCash` adds the petty-cash account (Settings, expenses). */
export async function listBankAccounts(withCash = false): Promise<BankAccount[]> {
  const { supabase } = await requireMember();
  let q = supabase.from("bank_accounts").select("*").order("is_default", { ascending: false }).order("created_at");
  if (!withCash) q = q.neq("kind", "cash");
  const { data } = await q;
  return ((data ?? []) as BankAccount[]).map((b) => ({ ...b, opening_balance: Number(b.opening_balance ?? 0) }));
}

export function supplierSnapshot(s: Settings, bank: BankAccount | null): SupplierSnapshot {
  return {
    business_name: s.business_name,
    legal_name: s.legal_name,
    address: s.address,
    state_code: s.state_code,
    gstin: s.gstin,
    pan: s.pan,
    lut_number: s.lut_number,
    signatory_name: s.signatory_name,
    signature_url: s.signature_path,
    query_email: s.query_email,
    query_phone: s.query_phone,
    bank: bank
      ? {
          account_name: bank.account_name,
          account_no: bank.account_no,
          ifsc: bank.ifsc,
          bank_name: bank.bank_name,
          branch_address: bank.branch_address,
          swift: bank.swift,
          iban: bank.iban,
          upi_id: bank.upi_id,
        }
      : null,
  };
}

export async function listClients(): Promise<Client[]> {
  const { supabase } = await requireMember();
  const { data, error } = await supabase.from("clients").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client | null> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return (data as Client) ?? null;
}

/** Projects with client name and budget (staff only; freelancers use listMyProjects). */
export async function listProjects(clientId?: string): Promise<(Project & { client_name: string; budget: number })[]> {
  const { supabase } = await requireMember();
  let q = supabase.from("projects").select("*, clients(name), project_finance(budget)").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data ?? []).map(({ clients, project_finance, ...p }) => ({
    ...(p as Project),
    budget_hours: Number(p.budget_hours),
    retainer_hours_month: Number(p.retainer_hours_month),
    budget: Number(project_finance?.budget ?? 0),
    client_name: clients?.name ?? "",
  }));
}

export async function listItems(): Promise<CatalogItem[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("items").select("*").order("name");
  return (data ?? []).map((i) => ({ ...(i as CatalogItem), unit_price: Number(i.unit_price) }));
}

type Row = Record<string, unknown>;
const num = (r: Row, k: string) => Number(r[k] ?? 0);

export function toDocument(row: Row, balance?: Row | null): DocumentRecord {
  const items = [...((row.document_items as Row[]) ?? (row.items as Row[]) ?? [])]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((i) => ({
      title: String(i.title ?? ""),
      description: String(i.description ?? ""),
      sac: String(i.sac ?? ""),
      qty: Number(i.qty),
      unit_price: Number(i.unit_price),
    }));
  const b = balance ?? (row.balance as Row | null) ?? null;
  return {
    id: String(row.id),
    doc_type: row.doc_type as DocType,
    status: row.status as DocStatus,
    number: (row.number as string) ?? null,
    fy: (row.fy as string) ?? null,
    client_id: (row.client_id as string) ?? null,
    client: { name: "", email: "", phone: "", address: "", city: "", pin: "", state_code: "", country: "India", gstin: "", ...(row.client_snapshot as object) },
    supplier: row.supplier_snapshot as SupplierSnapshot,
    bank_account_id: (row.bank_account_id as string) ?? null,
    project_id: (row.project_id as string) ?? null,
    source_id: (row.source_id as string) ?? null,
    source_relation: (row.source_relation as string) ?? null,
    issue_date: String(row.issue_date),
    due_date: (row.due_date as string) ?? null,
    valid_until: (row.valid_until as string) ?? null,
    currency: String(row.currency),
    fx_rate: num(row, "fx_rate") || 1,
    place_of_supply: String(row.place_of_supply ?? ""),
    reverse_charge: Boolean(row.reverse_charge),
    export_type: row.export_type as DocumentRecord["export_type"],
    gst_mode: row.gst_mode as DocumentRecord["gst_mode"],
    gst_rate: num(row, "gst_rate"),
    discount_type: row.discount_type as DocumentRecord["discount_type"],
    discount_value: num(row, "discount_value"),
    round_off: Boolean(row.round_off),
    notes: String(row.notes ?? ""),
    terms: String(row.terms ?? ""),
    payment_terms: String(row.payment_terms ?? ""),
    custom_fields: (row.custom_fields as DocumentRecord["custom_fields"]) ?? [],
    reminders_enabled: Boolean(row.reminders_enabled),
    recurring: (row.recurring as DocumentRecord["recurring"]) ?? null,
    subtotal: num(row, "subtotal"),
    discount_amount: num(row, "discount_amount"),
    taxable: num(row, "taxable"),
    cgst: num(row, "cgst"),
    sgst: num(row, "sgst"),
    igst: num(row, "igst"),
    round_off_amount: num(row, "round_off_amount"),
    total: num(row, "total"),
    lost_reason: String(row.lost_reason ?? ""),
    share_token: String(row.share_token ?? ""),
    share_enabled: Boolean(row.share_enabled),
    first_viewed_at: (row.first_viewed_at as string) ?? null,
    last_viewed_at: (row.last_viewed_at as string) ?? null,
    view_count: num(row, "view_count"),
    issued_at: (row.issued_at as string) ?? null,
    sent_at: (row.sent_at as string) ?? null,
    accepted_at: (row.accepted_at as string) ?? null,
    pdf_path: (row.pdf_path as string) ?? null,
    created_at: String(row.created_at),
    items,
    balance: b ? toBalance(b) : null,
  };
}

function toBalance(b: Row): Balance {
  return {
    paid: num(b, "paid"),
    tds: num(b, "tds"),
    credited: num(b, "credited"),
    balance: num(b, "balance"),
    payment_status: (b.payment_status as Balance["payment_status"]) ?? null,
    overdue: Boolean(b.overdue),
  };
}

async function balancesFor(ids: string[]) {
  if (!ids.length) return new Map<string, Row>();
  const { supabase } = await requireMember();
  const { data } = await supabase.from("document_balances").select("*").in("id", ids);
  return new Map((data ?? []).map((b) => [String(b.id), b as Row]));
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const { supabase } = await requireMember();
  const { data, error } = await supabase.from("documents").select("*, document_items(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const balances = await balancesFor([id]);
  return toDocument(data, balances.get(id));
}

export interface DocumentFilters {
  type?: DocType | "";
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  client?: string;
  project?: string;
}

export async function listDocuments(filters: DocumentFilters = {}): Promise<DocumentRecord[]> {
  const { supabase } = await requireMember();
  let query = supabase.from("documents").select("*").order("issue_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (filters.type) query = query.eq("doc_type", filters.type);
  if (filters.client) query = query.eq("client_id", filters.client);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.status && ["draft", "awaiting_approval", "issued", "accepted", "declined", "expired", "cancelled"].includes(filters.status)) {
    query = query.eq("status", filters.status);
  }
  if (filters.q) {
    const q = filters.q.replace(/[%,()*]/g, " ").trim();
    if (q) query = query.or(`number.ilike.%${q}%,client_snapshot->>name.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const balances = await balancesFor(rows.map((r) => String(r.id)));
  let docs = rows.map((r) => toDocument(r, balances.get(String(r.id))));
  // payment-status filters are derived, so they're applied after the query
  if (filters.status === "unpaid" || filters.status === "partial" || filters.status === "paid") {
    docs = docs.filter((d) => d.balance?.payment_status === filters.status);
  }
  if (filters.status === "overdue") docs = docs.filter((d) => d.balance?.overdue);
  return docs;
}

export async function listPayments(documentId: string): Promise<Payment[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("payments").select("*").eq("document_id", documentId).order("paid_on");
  return (data ?? []).map((p) => ({ ...(p as Payment), amount: Number(p.amount), tds_amount: Number(p.tds_amount) }));
}

export async function listAudit(entityId: string): Promise<AuditEvent[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("audit_events").select("*").eq("entity_id", entityId).order("at", { ascending: false }).limit(100);
  return (data ?? []) as AuditEvent[];
}

export async function listEmailLog(documentId: string) {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("email_log").select("*").eq("document_id", documentId).order("sent_at", { ascending: false });
  return data ?? [];
}

export async function listMembers(): Promise<Member[]> {
  const { supabase } = await requireMember();
  const { data, error } = await supabase.rpc("team_members");
  if (error) throw error;
  return (data ?? []) as Member[];
}

/** Documents linked to this one (conversions, credit notes, receipts, revisions). */
export async function relatedDocuments(id: string, sourceId: string | null) {
  const { supabase } = await requireMember();
  const ids = [id, sourceId].filter(Boolean) as string[];
  const { data } = await supabase
    .from("documents")
    .select("id, doc_type, number, status, total, currency, source_relation, source_id")
    .or(`source_id.in.(${ids.join(",")}),id.eq.${sourceId ?? id}`)
    .neq("id", id);
  return data ?? [];
}
