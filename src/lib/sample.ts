import type { InvoiceDraft, PaymentSnapshot } from "./types";

/** The reference invoice layout with dummy payment details, used for previews and visual tests. */
export const SAMPLE_INVOICE: InvoiceDraft = {
  number: "KK-2026-001",
  client_id: null,
  client: { name: "SuperDMC", address: "", gstin: "", email: "", phone: "" },
  issue_date: "2026-09-26",
  due_date: null,
  currency: "INR",
  payment_terms: "100% Final Payment",
  discount_type: "none",
  discount_value: 0,
  gst_mode: "none",
  gst_rate: 0,
  notes: "",
  items: [
    {
      title: "UI/UX Design Engagement - SuperDMC",
      description:
        "Redesign of 56 screens (21 website + 35 dashboard) on one design system, with reusable booking patterns, B2B pricing, new workflows, mobile layouts and two feedback rounds.",
      qty: 1,
      unit_price: 15000,
    },
  ],
};

export const SAMPLE_PAYMENT: PaymentSnapshot = {
  business_name: "Kora Kaagaz",
  upi_id: "9876543210@okbank",
  bank_account_no: "0012345678",
  bank_ifsc: "ABCD0001234",
  bank_address: "C-12, SECTOR-01,\nSAMPLE CITY, 100001",
  pan: "ABCDE1234F",
  gstin: "",
  query_email: "hello@korakaagaz.example",
  query_phone: "+91 98765 43210",
};
