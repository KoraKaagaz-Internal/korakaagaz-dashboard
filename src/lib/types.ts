export type Role = "admin" | "member" | "viewer" | "freelancer";
export type DocType = "invoice" | "quote" | "proforma" | "receipt" | "credit_note";
export type DocStatus = "draft" | "awaiting_approval" | "issued" | "accepted" | "declined" | "expired" | "cancelled";
export type PaymentStatus = "paid" | "partial" | "unpaid";
export type GstMode = "none" | "cgst_sgst" | "igst";
export type ExportType = "none" | "lut" | "igst";
export type DiscountType = "none" | "flat" | "percent";
export type PaymentMode = "upi" | "bank" | "cash" | "cheque" | "wire" | "advance";

export const DOC_TYPES: DocType[] = ["invoice", "quote", "proforma", "receipt", "credit_note"];

export const DOC_LABELS: Record<DocType, { title: string; plural: string; short: string }> = {
  invoice: { title: "Invoice", plural: "Invoices", short: "Invoice" },
  quote: { title: "Quotation", plural: "Quotes", short: "Quote" },
  proforma: { title: "Proforma Invoice", plural: "Proformas", short: "Proforma" },
  receipt: { title: "Receipt Voucher", plural: "Receipts", short: "Receipt" },
  credit_note: { title: "Credit Note", plural: "Credit notes", short: "Credit note" },
};

export interface Member {
  email: string;
  role: Role;
  name: string;
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
}

export interface Settings {
  gst_filing: "monthly" | "qrmp" | "none";
  business_name: string;
  legal_name: string;
  address: string;
  state_code: string;
  gstin: string;
  pan: string;
  lut_number: string;
  lut_fy: string;
  signatory_name: string;
  signature_path: string | null;
  query_email: string;
  query_phone: string;
  prefixes: Record<DocType, string>;
  default_currency: string;
  default_due_days: number;
  default_sac: string;
  default_gst_rate: number;
  require_approval: boolean;
  reminders_enabled: boolean;
  terms: Partial<Record<DocType, string>>;
  message_templates: Partial<Record<MessageKind, string>>;
}

export type MessageKind = "email_subject" | "email_body" | "whatsapp" | "reminder_subject" | "reminder_body";

export interface BankAccount {
  id: string;
  label: string;
  account_name: string;
  account_no: string;
  ifsc: string;
  bank_name: string;
  branch_address: string;
  swift: string;
  iban: string;
  upi_id: string;
  is_default: boolean;
  kind: "bank" | "cash";
  opening_balance: number;
  opening_date: string | null;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  cc_emails: string;
  phone: string;
  address: string;
  city: string;
  pin: string;
  state_code: string;
  country: string;
  gstin: string;
  notes: string;
}

export type ClientSnapshot = Omit<Client, "id" | "notes" | "cc_emails">;

/** Supplier details frozen onto each document when it is issued. */
export interface SupplierSnapshot {
  business_name: string;
  legal_name: string;
  address: string;
  state_code: string;
  gstin: string;
  pan: string;
  lut_number: string;
  signatory_name: string;
  signature_url?: string | null;
  query_email: string;
  query_phone: string;
  bank: Omit<BankAccount, "id" | "is_default" | "label" | "kind" | "opening_balance" | "opening_date"> | null;
}

export type ProjectStatus = "planned" | "active" | "on_hold" | "review" | "done" | "cancelled";
export type Billing = "fixed" | "hourly" | "retainer";

export interface Project {
  id: string;
  code: string;
  client_id: string | null;
  name: string;
  type: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  owner_email: string | null;
  budget_hours: number;
  retainer_hours_month: number;
  template_id: string | null;
  colour: string;
  created_at: string;
}

/** Staff-only money side of a project (table project_finance). */
export interface ProjectFinance {
  budget: number;
  billing: Billing;
  hourly_rate: number;
  retainer_amount_month: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  sac: string;
  unit_price: number;
}

export interface LineItem {
  title: string;
  description: string;
  sac: string;
  qty: number;
  unit_price: number;
}

export interface CustomField {
  label: string;
  value: string;
}

/** Everything the editor and the template need to render a document. */
export interface DocumentDraft {
  doc_type: DocType;
  number: string | null;
  client_id: string | null;
  client: ClientSnapshot;
  bank_account_id: string | null;
  project_id: string | null;
  source_id: string | null;
  source_relation: string | null;
  issue_date: string;
  due_date: string | null;
  valid_until: string | null;
  currency: string;
  fx_rate: number;
  place_of_supply: string;
  reverse_charge: boolean;
  export_type: ExportType;
  gst_mode: GstMode;
  gst_rate: number;
  discount_type: DiscountType;
  discount_value: number;
  round_off: boolean;
  notes: string;
  terms: string;
  payment_terms: string;
  custom_fields: CustomField[];
  reminders_enabled: boolean;
  recurring: { every: "month" | "quarter"; next: string } | null;
  items: LineItem[];
}

export interface Balance {
  paid: number;
  tds: number;
  credited: number;
  balance: number;
  payment_status: PaymentStatus | null;
  overdue: boolean;
}

export interface Payment {
  id: string;
  document_id: string;
  paid_on: string;
  amount: number;
  tds_amount: number;
  tds_section: string;
  mode: PaymentMode;
  reference: string;
  note: string;
  created_at: string;
}

export interface DocumentRecord extends DocumentDraft {
  id: string;
  status: DocStatus;
  fy: string | null;
  supplier: SupplierSnapshot;
  subtotal: number;
  discount_amount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  round_off_amount: number;
  total: number;
  lost_reason: string;
  share_token: string;
  share_enabled: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  issued_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  pdf_path: string | null;
  created_at: string;
  balance: Balance | null;
}

export interface AuditEvent {
  id: number;
  at: string;
  actor_email: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  diff: Record<string, unknown>;
}
