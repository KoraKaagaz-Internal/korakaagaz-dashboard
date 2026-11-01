import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_LABEL, priceTotals, type Agreement, type Signer } from "./agreements";
import { SIGNER_COLUMNS, toAgreement } from "./agreement-data";
import { sendMail, textToHtml } from "./mail";
import { formatMoney } from "./money";
import { renderPdf } from "./pdf";
import { createAdminClient } from "./supabase/admin";

type Row = Record<string, unknown>;

const secret = () => {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET is not set");
  return s;
};
export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const signingUrl = (token: string) => `${siteUrl()}/s/${token}`;

/** Signature for the internal print URL, so the PDF renderer can load an agreement without a login. */
export const printSig = (id: string) => createHmac("sha256", secret()).update(`agreement-print:${id}`).digest("hex");
export function checkPrintSig(id: string, sig: string) {
  const want = Buffer.from(printSig(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashOtp = (signerId: string, code: string) => createHmac("sha256", secret()).update(`otp:${signerId}:${code.trim()}`).digest("hex");
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface SignerFull extends Signer {
  agreement_id: string;
  token: string;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  otp_sent_count: number;
  otp_window_start: string | null;
  reminder_count: number;
}

/** Everything the public signing page needs, looked up by a signer's own token (service role). */
export async function loadByToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const supabase = createAdminClient();
  const { data: s } = await supabase.from("agreement_signers").select("*").eq("token", token).maybeSingle();
  if (!s) return null;
  const [{ data: a }, { data: others }, { data: settings }] = await Promise.all([
    supabase.from("agreements").select("*, clients(name)").eq("id", s.agreement_id).single(),
    supabase.from("agreement_signers").select(SIGNER_COLUMNS).eq("agreement_id", s.agreement_id).order("position"),
    supabase.from("settings").select("business_name, legal_name, query_email").eq("id", 1).single(),
  ]);
  if (!a || a.status === "draft") return null;
  return {
    supabase,
    signer: s as SignerFull,
    agreement: toAgreement(a as Row),
    clientName: ((a as Row).clients as { name?: string } | null)?.name ?? "",
    signers: (others ?? []) as Signer[],
    studio: (settings ?? { business_name: "Kora Kaagaz", legal_name: "", query_email: "" }) as { business_name: string; legal_name: string; query_email: string },
  };
}

export async function logEvent(
  supabase: SupabaseClient,
  e: { agreement_id: string; action: string; actor: string; signer_id?: string | null; ip?: string | null; user_agent?: string | null; detail?: Record<string, unknown> },
) {
  await supabase
    .from("agreement_events")
    .insert({ ...e, signer_id: e.signer_id ?? null, ip: e.ip ?? null, user_agent: e.user_agent?.slice(0, 300) ?? null, detail: e.detail ?? {} });
}

/** The email a signer gets with their link. */
export async function emailSigningLink(
  a: Pick<Agreement, "title" | "kind" | "message" | "expires_on">,
  signer: { name: string; email: string; token: string },
  studio: string,
  reminder = false,
) {
  const url = signingUrl(signer.token);
  const kind = KIND_LABEL[a.kind].toLowerCase();
  const text = [
    `Hi ${signer.name.split(" ")[0]},`,
    "",
    reminder ? `A reminder: ${studio} is waiting for your signature on "${a.title}".` : `${studio} has sent you a ${kind} to review and sign: "${a.title}".`,
    a.message ? `\n${a.message}\n` : "",
    `Open it here: ${url}`,
    "",
    "You'll get a 6-digit code by email to confirm it's you, then you can sign in a few seconds. No account needed.",
    a.expires_on ? `\nThis link works until ${a.expires_on}.` : "",
    "",
    `— ${studio}`,
  ].join("\n");
  return sendMail({ to: [signer.email], subject: `${reminder ? "Reminder: " : ""}Please sign: ${a.title}`, text, html: textToHtml(text) });
}

/**
 * Called when the last signer signs: render the signed PDF (document + certificate), fingerprint it,
 * store it, mark the agreement signed and send everyone a copy.
 */
export async function completeAgreement(supabase: SupabaseClient, agreementId: string) {
  const { data: a } = await supabase.from("agreements").select("*").eq("id", agreementId).single();
  if (!a) throw new Error("Agreement not found");
  const completedAt = new Date().toISOString();
  await supabase.from("agreements").update({ completed_at: completedAt }).eq("id", agreementId);
  await logEvent(supabase, { agreement_id: agreementId, action: "completed", actor: "system", detail: { note: "All parties signed" } });

  const pdf = await renderPdf(`${siteUrl()}/print/agreement/${agreementId}?sig=${printSig(agreementId)}`, []);
  const hash = sha256(pdf);
  const path = `agreements/${agreementId}/${String(a.number)}-signed.pdf`;
  const { error: upErr } = await supabase.storage.from("files").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`Couldn't store the signed PDF: ${upErr.message}`);
  await supabase.from("agreements").update({ status: "signed", final_hash: hash, signed_pdf_path: path }).eq("id", agreementId);
  await logEvent(supabase, { agreement_id: agreementId, action: "sealed", actor: "system", detail: { sha256: hash, file: path } });

  const { data: signers } = await supabase.from("agreement_signers").select("name, email").eq("agreement_id", agreementId);
  const { data: settings } = await supabase.from("settings").select("business_name").eq("id", 1).single();
  const studio = settings?.business_name ?? "Kora Kaagaz";
  const ag = toAgreement(a as Row);
  const totals = ag.kind === "proposal" && ag.items.length ? priceTotals(ag.items, ag.gst_rate) : null;
  const to = [...new Set([...(signers ?? []).map((s) => s.email as string), ag.created_by].filter(Boolean))];
  const text = [
    `"${ag.title}" (${ag.number}) has been signed by everyone.`,
    totals ? `\nAccepted total: ${formatMoney(totals.total, ag.currency)} including GST.` : "",
    "",
    "The signed copy is attached. Its last page is the signing certificate: who signed, when, and how they confirmed it.",
    `Fingerprint (SHA-256): ${hash}`,
    `Anyone can check a copy is unchanged at ${siteUrl()}/verify`,
    "",
    `— ${studio}`,
  ].join("\n");
  await sendMail({
    to,
    subject: `Signed: ${ag.title}`,
    text,
    html: textToHtml(text),
    attachments: [{ filename: `${ag.number}-signed.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  if (ag.created_by) {
    await supabase.from("notifications").insert({
      recipient_email: ag.created_by,
      actor_email: "signing link",
      kind: "agreement_signed",
      title: `${ag.title} was signed`,
      body: ag.kind === "proposal" ? "Create the quote from it when you're ready." : "The signed PDF is on the agreement.",
      link: `/agreements/${agreementId}`,
    });
  }
  return { hash };
}
