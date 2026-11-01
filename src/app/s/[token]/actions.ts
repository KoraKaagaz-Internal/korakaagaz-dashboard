"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { completeAgreement, hashOtp, loadByToken, logEvent, newOtp } from "@/lib/agreement-sign";
import { applyChoices, isValidOtp, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_HOUR, OTP_MINUTES } from "@/lib/agreements";
import { sendMail, textToHtml } from "@/lib/mail";
import { todayIso } from "@/lib/money";

type Out = { ok: true; message?: string; done?: boolean } | { ok: false; message: string };

async function client() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown", ua: h.get("user-agent") ?? "" };
}

/** Problems that stop anyone signing right now. */
function blocked(ctx: NonNullable<Awaited<ReturnType<typeof loadByToken>>>): string | null {
  const { agreement: a, signer: s } = ctx;
  if (s.signed_at) return "You've already signed this.";
  if (s.declined_at || a.status === "declined") return "This was declined.";
  if (a.status === "void") return "The studio has withdrawn this document.";
  if (a.status === "signed") return "This is already fully signed.";
  if (a.status === "expired" || (a.expires_on && a.expires_on < todayIso())) return "This link has expired. Ask the studio for a new one.";
  if (a.status !== "sent") return "This isn't open for signing.";
  return null;
}

/** First open of the link: recorded once in the signing log. */
export async function markViewed(token: string) {
  const ctx = await loadByToken(token);
  if (!ctx || ctx.signer.viewed_at) return;
  const { ip, ua } = await client();
  await ctx.supabase.from("agreement_signers").update({ viewed_at: new Date().toISOString() }).eq("id", ctx.signer.id);
  await logEvent(ctx.supabase, {
    agreement_id: ctx.agreement.id,
    action: "viewed",
    actor: `${ctx.signer.name} <${ctx.signer.email}>`,
    signer_id: ctx.signer.id,
    ip,
    user_agent: ua,
  });
}

/** Emails a 6-digit code to the signer's address (max 5 an hour). */
export async function sendCode(token: string): Promise<Out> {
  const ctx = await loadByToken(token);
  if (!ctx) return { ok: false, message: "This link isn't valid." };
  const stop = blocked(ctx);
  if (stop) return { ok: false, message: stop };
  const s = ctx.signer;
  const now = Date.now();
  const windowStart = s.otp_window_start ? Date.parse(s.otp_window_start) : 0;
  const inWindow = now - windowStart < 3600_000;
  if (inWindow && s.otp_sent_count >= OTP_MAX_SENDS_PER_HOUR) return { ok: false, message: "Too many codes. Try again in an hour." };
  const code = newOtp();
  await ctx.supabase
    .from("agreement_signers")
    .update({
      otp_hash: hashOtp(s.id, code),
      otp_expires_at: new Date(now + OTP_MINUTES * 60_000).toISOString(),
      otp_attempts: 0,
      otp_sent_count: inWindow ? s.otp_sent_count + 1 : 1,
      otp_window_start: inWindow ? s.otp_window_start : new Date(now).toISOString(),
    })
    .eq("id", s.id);
  const text = `Your code to sign "${ctx.agreement.title}" is ${code}.\n\nIt works for ${OTP_MINUTES} minutes. If you didn't ask for it, ignore this email.\n\n— ${ctx.studio.business_name}`;
  const r = await sendMail({ to: [s.email], subject: `${code} is your signing code`, text, html: textToHtml(text) });
  if (r.status === "failed" || (r.status === "skipped" && r.reason !== "test address")) return { ok: false, message: "We couldn't email the code. Please tell the studio." };
  const { ip, ua } = await client();
  await logEvent(ctx.supabase, {
    agreement_id: ctx.agreement.id,
    action: "code_sent",
    actor: `${s.name} <${s.email}>`,
    signer_id: s.id,
    ip,
    user_agent: ua,
    detail: { to: s.email },
  });
  const [user, domain] = s.email.split("@");
  return { ok: true, message: `We sent a code to ${user.slice(0, 2)}•••@${domain}.` };
}

export async function sign(token: string, input: { code: string; name: string; image: string | null; consent: boolean; choices: number[] }): Promise<Out> {
  const ctx = await loadByToken(token);
  if (!ctx) return { ok: false, message: "This link isn't valid." };
  const stop = blocked(ctx);
  if (stop) return { ok: false, message: stop };
  const { agreement: a, signer: s, supabase } = ctx;
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { ok: false, message: "Type your full name." };
  if (!input.consent) return { ok: false, message: "Tick the box to agree to sign electronically." };
  if (input.image && (!/^data:image\/png;base64,/.test(input.image) || input.image.length > 150_000))
    return { ok: false, message: "The drawn signature is too large. Clear it and try again." };
  if (!isValidOtp(input.code)) return { ok: false, message: "Enter the 6-digit code from the email." };
  if (!s.otp_hash || !s.otp_expires_at) return { ok: false, message: "Ask for a code first." };
  if (s.otp_attempts >= OTP_MAX_ATTEMPTS) return { ok: false, message: "Too many wrong codes. Ask for a new one." };
  if (Date.parse(s.otp_expires_at) < Date.now()) return { ok: false, message: "That code has expired. Ask for a new one." };
  const { ip, ua } = await client();
  if (hashOtp(s.id, input.code) !== s.otp_hash) {
    await supabase
      .from("agreement_signers")
      .update({ otp_attempts: s.otp_attempts + 1 })
      .eq("id", s.id);
    await logEvent(supabase, { agreement_id: a.id, action: "code_wrong", actor: `${s.name} <${s.email}>`, signer_id: s.id, ip, user_agent: ua });
    return { ok: false, message: `That code isn't right. ${OTP_MAX_ATTEMPTS - s.otp_attempts - 1} tries left.` };
  }

  // A proposal: the first client signer's add-on choices become part of the signed version.
  const firstClient = ctx.signers.find((x) => x.party === "client");
  const choosing = a.kind === "proposal" && a.items.some((i) => i.optional) && firstClient?.id === s.id;
  if (choosing) {
    const valid = input.choices.filter((n) => Number.isInteger(n) && a.items[n]?.optional);
    await supabase
      .from("agreements")
      .update({ items: applyChoices(a.items, valid) })
      .eq("id", a.id)
      .eq("status", "sent");
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("agreement_signers")
    .update({ verified_at: now, signed_at: now, signature_name: name, signature_image: input.image, signed_ip: ip, signed_user_agent: ua.slice(0, 300), otp_hash: null })
    .eq("id", s.id)
    .is("signed_at", null)
    .select("id");
  if (!updated?.length) return { ok: false, message: "You've already signed this." };
  await logEvent(supabase, { agreement_id: a.id, action: "code_verified", actor: `${s.name} <${s.email}>`, signer_id: s.id, ip, user_agent: ua, detail: { email: s.email } });
  await logEvent(supabase, {
    agreement_id: a.id,
    action: "signed",
    actor: `${s.name} <${s.email}>`,
    signer_id: s.id,
    ip,
    user_agent: ua,
    detail: { typed_name: name, drawn: !!input.image, ...(choosing ? { add_ons: input.choices } : {}) },
  });

  const { data: left } = await supabase.from("agreement_signers").select("id").eq("agreement_id", a.id).is("signed_at", null);
  if (left?.length) {
    revalidatePath(`/s/${token}`);
    revalidatePath(`/agreements/${a.id}`);
    return { ok: true, message: "Signed. We'll email you the final copy when everyone has signed." };
  }
  try {
    await completeAgreement(supabase, a.id);
  } catch (e) {
    await logEvent(supabase, { agreement_id: a.id, action: "seal_failed", actor: "system", detail: { error: (e as Error).message.slice(0, 300) } });
    return { ok: true, done: true, message: "Signed. The final copy is being prepared; the studio will send it to you." };
  }
  revalidatePath(`/s/${token}`);
  revalidatePath(`/agreements/${a.id}`);
  return { ok: true, done: true, message: "Signed by everyone. The signed copy is on its way to your inbox." };
}

export async function decline(token: string, reason: string): Promise<Out> {
  const ctx = await loadByToken(token);
  if (!ctx) return { ok: false, message: "This link isn't valid." };
  const stop = blocked(ctx);
  if (stop) return { ok: false, message: stop };
  const { ip, ua } = await client();
  const { agreement: a, signer: s, supabase } = ctx;
  await supabase
    .from("agreement_signers")
    .update({ declined_at: new Date().toISOString(), decline_reason: reason.slice(0, 500) })
    .eq("id", s.id);
  await supabase.from("agreements").update({ status: "declined" }).eq("id", a.id);
  await logEvent(supabase, {
    agreement_id: a.id,
    action: "declined",
    actor: `${s.name} <${s.email}>`,
    signer_id: s.id,
    ip,
    user_agent: ua,
    detail: { reason: reason.slice(0, 500) },
  });
  if (a.created_by) {
    await supabase
      .from("notifications")
      .insert({
        recipient_email: a.created_by,
        actor_email: s.email,
        kind: "agreement_declined",
        title: `${s.name} declined ${a.title}`,
        body: reason.slice(0, 300),
        link: `/agreements/${a.id}`,
      });
  }
  revalidatePath(`/s/${token}`);
  return { ok: true, message: "Thanks for letting us know. The studio has been told." };
}
