import "server-only";
import nodemailer from "nodemailer";

export interface MailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export type MailResult = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; error: string };

/**
 * Sends from team@korakaagaz.co through Google Workspace SMTP with an app password.
 * Without SMTP_PASS (or with MAIL_DRY_RUN=1) nothing is sent and the caller logs "skipped".
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const user = process.env.SMTP_USER || "team@korakaagaz.co";
  const pass = process.env.SMTP_PASS;
  if (!pass || process.env.MAIL_DRY_RUN === "1") {
    return { status: "skipped", reason: pass ? "MAIL_DRY_RUN is on" : "Email isn't set up yet (SMTP_PASS missing)" };
  }
  try {
    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await transport.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || "Kora Kaagaz"}" <${user}>`,
      replyTo: user,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: (e as Error).message.slice(0, 500) };
  }
}

export function mailConfigured(): boolean {
  return !!process.env.SMTP_PASS && process.env.MAIL_DRY_RUN !== "1";
}

export function splitEmails(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

/** Minimal HTML version of a plain-text message (links made clickable). */
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#081788">$1</a>');
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2d">${linked.replace(/\n/g, "<br>")}</div>`;
}
