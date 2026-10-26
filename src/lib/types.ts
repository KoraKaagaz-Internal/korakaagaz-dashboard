export type GstMode = "none" | "cgst_sgst" | "igst";
export type DiscountType = "none" | "flat" | "percent";
export type InvoiceStatus = "draft" | "sent" | "paid";

export interface Settings {
  owner_id: string;
  business_name: string;
  upi_id: string;
  bank_account_no: string;
  bank_ifsc: string;
  bank_address: string;
  pan: string;
  gstin: string;
  query_email: string;
  query_phone: string;
  invoice_prefix: string;
  next_number: number;
  default_currency: string;
  default_payment_terms: string;
  default_gst_mode: GstMode;
  default_gst_rate: number;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  gstin: string;
  email: string;
  phone: string;
}

export type ClientSnapshot = Omit<Client, "id">;

export type PaymentSnapshot = Pick<
  Settings,
  | "business_name"
  | "upi_id"
  | "bank_account_no"
  | "bank_ifsc"
  | "bank_address"
  | "pan"
  | "gstin"
  | "query_email"
  | "query_phone"
>;

export interface LineItem {
  title: string;
  description: string;
  qty: number;
  unit_price: number;
}

export interface InvoiceDraft {
  number: string;
  client_id: string | null;
  client: ClientSnapshot;
  issue_date: string; // YYYY-MM-DD
  due_date: string | null;
  currency: string;
  payment_terms: string;
  discount_type: DiscountType;
  discount_value: number;
  gst_mode: GstMode;
  gst_rate: number;
  notes: string;
  items: LineItem[];
}

export interface Invoice extends InvoiceDraft {
  id: string;
  payment: PaymentSnapshot;
  status: InvoiceStatus;
  paid_at: string | null;
  pdf_path: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  created_at: string;
}
