"use server";

import { revalidatePath } from "next/cache";
import { getDocument, getSettings, listDocuments, requireMember } from "@/lib/data";
import { documentPdf } from "@/lib/document-pdf";
import { sendMail, splitEmails, textToHtml } from "@/lib/mail";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { pdfFileName } from "@/lib/pdf";
import { siteUrl } from "./auth";

export async function sendDocumentEmail(id: string, input: { to: string; cc: string; subject: string; body: string }) {
  const { supabase } = await requireMember("member");
  const doc = await getDocument(id);
  if (!doc) return { ok: false as const, message: "Document not found" };
  if (["draft", "awaiting_approval", "cancelled"].includes(doc.status)) return { ok: false as const, message: "Issue the document before sending it" };
  const to = splitEmails(input.to);
  if (!to.length) return { ok: false as const, message: "Add the client's email address" };

  const pdf = await documentPdf(id);
  const result = await sendMail({
    to,
    cc: splitEmails(input.cc),
    subject: input.subject,
    text: input.body,
    html: textToHtml(input.body),
    attachments: [{ filename: pdfFileName(doc.number), content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  await supabase.from("email_log").insert({
    document_id: id,
    client_id: doc.client_id,
    kind: "document",
    to_email: to.join(", "),
    subject: input.subject,
    status: result.status,
    error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : "",
  });
  if (result.status === "sent") await supabase.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/documents/${id}`);
  if (result.status === "sent") return { ok: true as const, message: `Sent to ${to.join(", ")}` };
  return { ok: false as const, message: result.status === "skipped" ? result.reason : `Email failed: ${result.error}` };
}

/** Marks a document as sent when it was shared some other way (WhatsApp, in person). */
export async function markSent(id: string) {
  const { supabase } = await requireMember("member");
  await supabase.from("documents").update({ sent_at: new Date().toISOString() }).eq("id", id).is("sent_at", null);
  revalidatePath(`/documents/${id}`);
  return { ok: true as const };
}

/** One email to a client listing every unpaid invoice (statement-style reminder). */
export async function sendStatement(clientId: string) {
  const { supabase } = await requireMember("member");
  const [settings, docs] = await Promise.all([getSettings(), listDocuments({ type: "invoice", client: clientId })]);
  const unpaid = docs.filter((d) => d.status === "issued" && d.balance && d.balance.balance > 0.005);
  if (!unpaid.length) return { ok: false as const, message: "Nothing outstanding for this client" };
  const to = splitEmails(unpaid[0].client.email);
  const { data: client } = await supabase.from("clients").select("email, cc_emails, name").eq("id", clientId).single();
  const recipients = splitEmails(client?.email ?? "").length ? splitEmails(client!.email) : to;
  if (!recipients.length) return { ok: false as const, message: "Add an email address to this client first" };

  const url = await siteUrl();
  const today = todayIso();
  const lines = unpaid.map((d) => {
    const due = d.due_date ? ` · due ${formatInvoiceDate(d.due_date)}${d.due_date < today ? " (overdue)" : ""}` : "";
    return `• ${d.number} · ${formatInvoiceDate(d.issue_date)} · balance ${formatMoney(d.balance!.balance, d.currency)}${due}\n  ${url}/d/${d.share_token}`;
  });
  const totals = new Map<string, number>();
  for (const d of unpaid) totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.balance!.balance);
  const totalLine = [...totals].map(([c, v]) => formatMoney(v, c)).join(" + ");
  const body = `Hi ${client?.name ?? unpaid[0].client.name},\n\nHere's a summary of open invoices from ${settings.business_name}:\n\n${lines.join("\n\n")}\n\nTotal outstanding: ${totalLine}\n\nEach link has the invoice and a UPI QR to pay. If you've already paid, please reply with the reference so we can update our records.\n\nThank you,\n${settings.business_name}`;
  const subject = `Statement of open invoices · ${totalLine}`;
  const result = await sendMail({ to: recipients, cc: splitEmails(client?.cc_emails ?? ""), subject, text: body, html: textToHtml(body) });
  await supabase.from("email_log").insert({
    client_id: clientId,
    kind: "statement",
    to_email: recipients.join(", "),
    subject,
    status: result.status,
    error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : "",
  });
  if (result.status === "sent") return { ok: true as const, message: `Statement sent to ${recipients.join(", ")}` };
  return { ok: false as const, message: result.status === "skipped" ? result.reason : `Email failed: ${result.error}`, body };
}
