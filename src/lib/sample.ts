import type { DocumentDraft, SupplierSnapshot } from "./types";

/** The reference invoice layout with dummy business and payment details, used for previews and visual tests. */
export const SAMPLE_DOC: DocumentDraft = {
  doc_type: "invoice",
  number: "KK/26-27/001",
  client_id: null,
  client: { name: "SuperDMC", email: "", phone: "", address: "", city: "", pin: "", state_code: "21", country: "India", gstin: "" },
  bank_account_id: null,
  project_id: null,
  source_id: null,
  source_relation: null,
  issue_date: "2026-09-26",
  due_date: null,
  valid_until: null,
  currency: "INR",
  fx_rate: 1,
  place_of_supply: "21",
  reverse_charge: false,
  export_type: "none",
  gst_mode: "none",
  gst_rate: 0,
  discount_type: "none",
  discount_value: 0,
  round_off: false,
  notes: "",
  terms: "",
  payment_terms: "100% Final Payment",
  custom_fields: [],
  reminders_enabled: true,
  recurring: null,
  items: [
    {
      title: "UI/UX Design Engagement - SuperDMC",
      description:
        "Redesign of 56 screens (21 website + 35 dashboard) on one design system, with reusable booking patterns, B2B pricing, new workflows, mobile layouts and two feedback rounds.",
      sac: "",
      qty: 1,
      unit_price: 15000,
    },
  ],
};

export const SAMPLE_SUPPLIER: SupplierSnapshot = {
  business_name: "Kora Kaagaz",
  legal_name: "",
  address: "",
  state_code: "",
  gstin: "",
  pan: "ABCDE1234F",
  lut_number: "",
  signatory_name: "",
  signature_url: null,
  query_email: "hello@korakaagaz.example",
  query_phone: "+91 98765 43210",
  bank: {
    account_name: "",
    account_no: "0012345678",
    ifsc: "ABCD0001234",
    bank_name: "",
    branch_address: "C-12, SECTOR-01,\nSAMPLE CITY, 100001",
    swift: "",
    iban: "",
    upi_id: "9876543210@okbank",
  },
};

/** A fully filled GST invoice: supplier block, SAC, CGST/SGST, QR, words, signatory. */
export const SAMPLE_GST_DOC: DocumentDraft = {
  ...SAMPLE_DOC,
  client: { ...SAMPLE_DOC.client, address: "Plot 14, Saheed Nagar", city: "Bhubaneswar", pin: "751007", gstin: "21AAPFU0939F1ZE" },
  gst_mode: "cgst_sgst",
  gst_rate: 18,
  round_off: true,
  due_date: "2026-10-03",
  payment_terms: "Net 7",
  custom_fields: [{ label: "PO No.", value: "4471" }],
  items: SAMPLE_DOC.items.map((i) => ({ ...i, sac: "998391" })),
};

export const SAMPLE_GST_SUPPLIER: SupplierSnapshot = {
  ...SAMPLE_SUPPLIER,
  legal_name: "Kora Kaagaz Studio LLP",
  address: "C-12, Sector-01, Sample City",
  state_code: "21",
  gstin: "21ABCDE1234F1Z5",
  signatory_name: "Ashmit Kumar Nayak",
};
