// Agreements (pure): kinds, merge fields, a small safe markdown renderer, proposal pricing.
import { round2 } from "./money";

export type AgreementKind = "proposal" | "contract" | "nda" | "freelancer" | "model_release" | "licence" | "other";
export type AgreementStatus = "draft" | "sent" | "signed" | "declined" | "expired" | "void";

export const KINDS: { key: AgreementKind; label: string }[] = [
  { key: "proposal", label: "Proposal" },
  { key: "contract", label: "Contract" },
  { key: "nda", label: "NDA" },
  { key: "freelancer", label: "Freelancer agreement" },
  { key: "model_release", label: "Model release" },
  { key: "licence", label: "Usage licence" },
  { key: "other", label: "Other" },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.label])) as Record<AgreementKind, string>;

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Waiting for signature",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  void: "Void",
};

export interface PriceItem {
  title: string;
  description: string;
  amount: number;
  optional: boolean;
  selected: boolean;
}

export interface Agreement {
  id: string;
  number: string;
  title: string;
  kind: AgreementKind;
  status: AgreementStatus;
  template_id: string | null;
  client_id: string | null;
  project_id: string | null;
  lead_id: string | null;
  body: string;
  items: PriceItem[];
  currency: string;
  gst_rate: number;
  message: string;
  expires_on: string | null;
  starts_on: string | null;
  ends_on: string | null;
  renewal_notice_days: number;
  sent_at: string | null;
  completed_at: string | null;
  final_hash: string | null;
  signed_pdf_path: string | null;
  quote_id: string | null;
  created_by: string;
  created_at: string;
}

export interface Signer {
  id: string;
  position: number;
  party: "client" | "studio" | "other";
  name: string;
  email: string;
  viewed_at: string | null;
  verified_at: string | null;
  signed_at: string | null;
  signature_name: string | null;
  /** Only on the signing certificate. */
  signed_ip?: string | null;
  declined_at: string | null;
  decline_reason: string;
}

// ---------------------------------------------------------------------------
// Merge fields: {{client.name}} etc. Unknown fields stay visible as [client.name] so they get noticed.
// ---------------------------------------------------------------------------
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "title", label: "Document title" },
  { key: "date", label: "Today's date" },
  { key: "client.name", label: "Client name" },
  { key: "client.address", label: "Client address" },
  { key: "client.gstin_line", label: "Client GSTIN (with label, if any)" },
  { key: "project.name", label: "Project name" },
  { key: "studio.name", label: "Studio name" },
  { key: "studio.legal_name", label: "Studio legal name" },
  { key: "studio.address", label: "Studio address" },
  { key: "studio.gstin", label: "Studio GSTIN" },
  { key: "studio.city", label: "Studio city (for jurisdiction)" },
  { key: "fee", label: "Fee (from the project budget or the pricing)" },
  { key: "gst_rate", label: "GST rate" },
  { key: "valid_until", label: "Offer valid until" },
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date" },
];

export function fillMerge(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, key: string) => {
    const v = values[key];
    return v !== undefined && v !== "" ? v : `[${key}]`;
  });
}

/** Fields still unfilled after merging (shown as [field]). */
export function unfilled(text: string): string[] {
  return [...new Set([...text.matchAll(/\[([a-z_]+(?:\.[a-z_]+)?)\]/g)].map((m) => m[1]).filter((k) => MERGE_FIELDS.some((f) => f.key === k)))];
}

// ---------------------------------------------------------------------------
// Markdown (subset): # ## ### headings, **bold**, *italic*, - and 1. lists, paragraphs, line breaks.
// Everything is escaped first, so the output is safe to inject.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([a-z_]+(?:\.[a-z_]+)?)\]/g, '<mark class="ag-missing">[$1]</mark>');

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ul || ol) {
      flushPara();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Proposal pricing
// ---------------------------------------------------------------------------
export function cleanItems(items: unknown): PriceItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => i as Partial<PriceItem>)
    .filter((i) => i && String(i.title ?? "").trim())
    .map((i) => ({
      title: String(i.title).trim().slice(0, 200),
      description: String(i.description ?? "").slice(0, 500),
      amount: Math.max(0, round2(Number(i.amount) || 0)),
      optional: !!i.optional,
      selected: i.optional ? !!i.selected : true,
    }));
}

/** Totals for the chosen lines (required lines always count). */
export function priceTotals(items: PriceItem[], gstRate: number) {
  const chosen = items.filter((i) => !i.optional || i.selected);
  const subtotal = round2(chosen.reduce((s, i) => s + i.amount, 0));
  const gst = round2((subtotal * gstRate) / 100);
  return { chosen, subtotal, gst, total: round2(subtotal + gst) };
}

/** Applies the client's add-on choices (by index) to the sent items; required lines can't be dropped. */
export function applyChoices(items: PriceItem[], selected: number[]): PriceItem[] {
  return items.map((i, n) => (i.optional ? { ...i, selected: selected.includes(n) } : { ...i, selected: true }));
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------
export const OTP_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS_PER_HOUR = 5;

export function isValidOtp(code: string) {
  return /^\d{6}$/.test(code.trim());
}
