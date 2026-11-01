import { formatInvoiceDate, formatMoney } from "./money";
import { DOC_LABELS, type DocumentRecord, type MessageKind } from "./types";

export const DEFAULT_MESSAGES: Record<MessageKind, string> = {
  email_subject: "{doc_title} {doc_no} from {business}",
  email_body: "Hi {client},\n\nPlease find {doc_title_lower} {doc_no} for {amount} attached.{due_line}\n\nView it online and pay by UPI: {link}\n\nThank you,\n{business}",
  whatsapp: "Hi {client}, here is {doc_title_lower} {doc_no} for {amount} from {business}.{due_line} View & pay: {link}",
  reminder_subject: "Reminder: {doc_no} for {amount} {due_phrase}",
  reminder_body:
    "Hi {client},\n\nA friendly reminder that {doc_no} for {amount} {due_phrase}. Balance due: {balance}.\n\nView it and pay by UPI: {link}\n\nIf you've already paid, please ignore this, or reply with the reference so we can update our records.\n\nThank you,\n{business}",
};

export const PLACEHOLDERS = ["client", "doc_title", "doc_title_lower", "doc_no", "amount", "balance", "due", "due_line", "due_phrase", "link", "business"];

/** Replaces {name} placeholders; unknown ones are left as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key] : m));
}

/** Placeholder values for a document's messages. */
export function messageValues(
  doc: Pick<DocumentRecord, "doc_type" | "number" | "total" | "currency" | "due_date" | "valid_until" | "client" | "balance">,
  business: string,
  link: string,
  today: string,
): Record<string, string> {
  const title = DOC_LABELS[doc.doc_type].title;
  const due = doc.doc_type === "quote" ? doc.valid_until : doc.due_date;
  const overdue = !!due && due < today;
  return {
    client: doc.client.name || "there",
    doc_title: title,
    doc_title_lower: title.toLowerCase(),
    doc_no: doc.number ?? "",
    amount: formatMoney(doc.total, doc.currency),
    balance: formatMoney(doc.balance?.balance ?? doc.total, doc.currency),
    due: due ? formatInvoiceDate(due) : "",
    due_line: due ? (doc.doc_type === "quote" ? ` Valid until ${formatInvoiceDate(due)}.` : ` Due by ${formatInvoiceDate(due)}.`) : "",
    due_phrase: !due ? "is due" : due === today ? "is due today" : overdue ? `was due on ${formatInvoiceDate(due)}` : `is due on ${formatInvoiceDate(due)}`,
    link,
    business,
  };
}
