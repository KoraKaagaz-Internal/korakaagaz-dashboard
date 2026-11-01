"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mergeValues } from "@/lib/agreement-data";
import { completeAgreement, emailSigningLink, logEvent, signingUrl } from "@/lib/agreement-sign";
import { cleanItems, fillMerge, priceTotals, unfilled } from "@/lib/agreements";
import { getSettings, requireMember } from "@/lib/data";
import { addDays, addMonths, todayIso } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { OUTSIDE_INDIA, autoGstMode } from "@/lib/gst";
import { saveDocument } from "./documents";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const KIND = z.enum(["proposal", "contract", "nda", "freelancer", "model_release", "licence", "other"]);

function refresh(id?: string) {
  revalidatePath("/agreements");
  if (id) revalidatePath(`/agreements/${id}`);
}

// ---------------------------------------------------------------------------
// Create, edit, delete
// ---------------------------------------------------------------------------
const createSchema = z.object({
  template_id: uuid.nullable().default(null),
  kind: KIND.default("contract"),
  title: z.string().trim().max(200).default(""),
  client_id: uuid.nullable().default(null),
  project_id: uuid.nullable().default(null),
  lead_id: uuid.nullable().default(null),
});

/** New draft from a template, with the merge fields filled from the client, project and settings. */
export async function createAgreement(input: z.input<typeof createSchema>): Promise<Result<{ id: string }>> {
  const { supabase, email } = await requireMember("member");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("Check the form");
  const f = parsed.data;
  const [{ data: tpl }, { data: client }, { data: project }, { data: lead }, settings] = await Promise.all([
    f.template_id ? supabase.from("agreement_templates").select("*").eq("id", f.template_id).maybeSingle() : Promise.resolve({ data: null }),
    f.client_id ? supabase.from("clients").select("id, name, email, address, city, pin, gstin").eq("id", f.client_id).maybeSingle() : Promise.resolve({ data: null }),
    f.project_id ? supabase.from("projects").select("id, name, client_id, project_finance(budget)").eq("id", f.project_id).maybeSingle() : Promise.resolve({ data: null }),
    f.lead_id ? supabase.from("leads").select("id, name, company, email, client_id, project_id, value").eq("id", f.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    getSettings(),
  ]);
  const kind = (tpl?.kind as typeof f.kind) ?? f.kind;
  const clientId = f.client_id ?? (project?.client_id as string | null) ?? (lead?.client_id as string | null) ?? null;
  const c = client ?? (clientId ? (await supabase.from("clients").select("id, name, email, address, city, pin, gstin").eq("id", clientId).maybeSingle()).data : null);
  const today = todayIso();
  const items = cleanItems(tpl?.items ?? []);
  const gstRate = settings.default_gst_rate;
  const budget = Number((project?.project_finance as { budget?: number } | null)?.budget ?? 0);
  const fee = items.length ? priceTotals(items, 0).subtotal : budget || Number(lead?.value ?? 0) || null;
  const expires = kind === "proposal" ? addDays(today, 15) : addDays(today, 30);
  const endsOn = tpl?.ends_after_months ? addMonths(today, Number(tpl.ends_after_months)) : null;
  const title = f.title || (tpl ? `${tpl.name.replace(/^Proposal: /, "")}${c ? ` · ${c.name}` : ""}` : "Untitled");
  const values = mergeValues({ title, today, settings, client: c, project, fee, gstRate, validUntil: expires, startsOn: today, endsOn });
  const { data, error } = await supabase
    .from("agreements")
    .insert({
      title,
      kind,
      template_id: tpl?.id ?? null,
      client_id: c?.id ?? null,
      project_id: project?.id ?? (lead?.project_id as string | null) ?? null,
      lead_id: lead?.id ?? null,
      body: fillMerge(tpl?.body ?? "", values),
      items,
      gst_rate: gstRate,
      expires_on: expires,
      starts_on: today,
      ends_on: endsOn,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  // the client signs first; for contracts the studio counter-signs
  const signers = [];
  const clientEmail = (c?.email as string) || (lead?.email as string) || "";
  if (clientEmail.includes("@"))
    signers.push({ agreement_id: data.id, position: 1, party: "client", name: (lead?.name as string) || (c?.name as string) || "Client", email: clientEmail.split(/[,;\s]+/)[0] });
  if (kind !== "proposal" && kind !== "model_release")
    signers.push({ agreement_id: data.id, position: 2, party: "studio", name: settings.signatory_name || email.split("@")[0], email });
  if (signers.length) await supabase.from("agreement_signers").insert(signers);
  await logEvent(supabase, { agreement_id: data.id, action: "created", actor: email, detail: { template: tpl?.name ?? null } });
  refresh();
  return { ok: true, id: data.id as string };
}

const saveSchema = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200),
  body: z.string().max(100000),
  items: z.array(z.object({ title: z.string(), description: z.string(), amount: z.coerce.number().min(0), optional: z.boolean(), selected: z.boolean() })).max(50),
  gst_rate: z.coerce.number().min(0).max(28),
  message: z.string().trim().max(2000),
  expires_on: isoDate.nullable(),
  starts_on: isoDate.nullable(),
  ends_on: isoDate.nullable(),
  renewal_notice_days: z.coerce.number().int().min(0).max(365),
  client_id: uuid.nullable(),
  project_id: uuid.nullable(),
  signers: z
    .array(
      z.object({
        party: z.enum(["client", "studio", "other"]),
        name: z.string().trim().min(1, "Each signer needs a name").max(120),
        email: z.string().trim().toLowerCase().email("Check the signer emails"),
      }),
    )
    .max(6),
});

export async function saveAgreement(id: string, input: z.input<typeof saveSchema>): Promise<Result> {
  const { supabase } = await requireMember("member");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const { signers, ...row } = parsed.data;
  if (new Set(signers.map((s) => s.email)).size !== signers.length) return fail("Each signer needs a different email");
  const { error } = await supabase
    .from("agreements")
    .update({ ...row, items: cleanItems(row.items) })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return fail(error.message);
  const { error: delErr } = await supabase.from("agreement_signers").delete().eq("agreement_id", id);
  if (delErr) return fail(delErr.message);
  if (signers.length) {
    const { error: sErr } = await supabase.from("agreement_signers").insert(signers.map((s, i) => ({ ...s, agreement_id: id, position: i + 1 })));
    if (sErr) return fail(sErr.message);
  }
  refresh(id);
  return { ok: true };
}

export async function deleteAgreement(id: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("agreements").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

/** A new draft with the same content (to change something after sending). */
export async function duplicateAgreement(id: string): Promise<Result<{ id: string }>> {
  const { supabase, email } = await requireMember("member");
  const [{ data: a }, { data: signers }] = await Promise.all([
    supabase.from("agreements").select("*").eq("id", id).single(),
    supabase.from("agreement_signers").select("position, party, name, email").eq("agreement_id", id),
  ]);
  if (!a) return fail("Not found");
  const today = todayIso();
  const { data, error } = await supabase
    .from("agreements")
    .insert({
      title: `${a.title} (copy)`.slice(0, 200),
      kind: a.kind,
      template_id: a.template_id,
      client_id: a.client_id,
      project_id: a.project_id,
      lead_id: a.lead_id,
      body: a.body,
      items: cleanItems(a.items).map((i) => ({ ...i, selected: i.optional ? false : true })),
      currency: a.currency,
      gst_rate: a.gst_rate,
      message: a.message,
      expires_on: addDays(today, a.kind === "proposal" ? 15 : 30),
      starts_on: a.starts_on,
      ends_on: a.ends_on,
      renewal_notice_days: a.renewal_notice_days,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  if (signers?.length) await supabase.from("agreement_signers").insert(signers.map((s) => ({ ...s, agreement_id: data.id })));
  await logEvent(supabase, { agreement_id: data.id, action: "created", actor: email, detail: { copied_from: a.number } });
  refresh();
  return { ok: true, id: data.id as string };
}

// ---------------------------------------------------------------------------
// Send, remind, void
// ---------------------------------------------------------------------------
export async function sendAgreement(id: string): Promise<Result<{ emailed: number; skipped: string }>> {
  const { supabase, email } = await requireMember("member");
  const [{ data: a }, { data: signers }, settings] = await Promise.all([
    supabase.from("agreements").select("*").eq("id", id).single(),
    supabase.from("agreement_signers").select("id, name, email").eq("agreement_id", id).order("position"),
    getSettings(),
  ]);
  if (!a) return fail("Not found");
  if (a.status !== "draft") return fail("This has already been sent");
  if (!signers?.length) return fail("Add at least one signer");
  const missing = unfilled(`${a.title}\n${a.body}`);
  if (missing.length) return fail(`Fill in or remove the highlighted fields first: ${missing.map((m) => `[${m}]`).join(", ")}`);
  if (!String(a.body).trim()) return fail("The document is empty");
  if (a.expires_on && a.expires_on < todayIso()) return fail("The 'valid until' date has passed");
  const { error } = await supabase.from("agreements").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  if (error) return fail(error.message);
  await logEvent(supabase, { agreement_id: id, action: "sent", actor: email, detail: { to: signers.map((s) => s.email) } });

  // tokens are hidden from the API roles; read them with the service role
  const admin = createAdminClient();
  const { data: withTokens } = await admin.from("agreement_signers").select("name, email, token").eq("agreement_id", id).order("position");
  let emailed = 0;
  let skipped = "";
  for (const s of withTokens ?? []) {
    const r = await emailSigningLink(a, s, settings.business_name);
    if (r.status === "sent") emailed++;
    else skipped = r.status === "skipped" ? r.reason : r.error;
  }
  refresh(id);
  return { ok: true, emailed, skipped };
}

/** The signer's private link, to share another way (WhatsApp). */
export async function signerLink(signerId: string): Promise<Result<{ url: string }>> {
  const { supabase } = await requireMember("member");
  const { data: s } = await supabase.from("agreement_signers").select("id, agreement_id").eq("id", signerId).maybeSingle();
  if (!s) return fail("Not found");
  const { data } = await createAdminClient().from("agreement_signers").select("token").eq("id", signerId).single();
  return { ok: true, url: signingUrl(data!.token as string) };
}

export async function remindSigner(signerId: string): Promise<Result> {
  const { supabase, email } = await requireMember("member");
  const admin = createAdminClient();
  const { data: s } = await admin.from("agreement_signers").select("id, agreement_id, name, email, token, signed_at, declined_at, reminder_count").eq("id", signerId).maybeSingle();
  if (!s) return fail("Not found");
  const { data: a } = await supabase.from("agreements").select("*").eq("id", s.agreement_id).single();
  if (!a || a.status !== "sent") return fail("Only agreements waiting for signatures can be chased");
  if (s.signed_at || s.declined_at) return fail("They've already responded");
  const settings = await getSettings();
  const r = await emailSigningLink(a, s, settings.business_name, true);
  if (r.status !== "sent") return fail(r.status === "skipped" ? r.reason : r.error);
  await admin
    .from("agreement_signers")
    .update({ reminded_at: new Date().toISOString(), reminder_count: Number(s.reminder_count) + 1 })
    .eq("id", s.id);
  await logEvent(supabase, { agreement_id: s.agreement_id, action: "reminded", actor: email, detail: { signer: s.email } });
  refresh(s.agreement_id);
  return { ok: true };
}

export async function voidAgreement(id: string, reason: string): Promise<Result> {
  const { supabase, email } = await requireMember("member");
  const { data: a } = await supabase.from("agreements").select("status").eq("id", id).single();
  if (!a || !["sent", "signed"].includes(a.status)) return fail("Only sent or signed agreements can be voided");
  const { error } = await supabase.from("agreements").update({ status: "void" }).eq("id", id);
  if (error) return fail(error.message);
  await logEvent(supabase, { agreement_id: id, action: "voided", actor: email, detail: { reason: reason.slice(0, 500) } });
  refresh(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const templateSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name it").max(120),
  kind: KIND,
  description: z.string().trim().max(300).default(""),
  body: z.string().max(100000),
  items: z
    .array(z.object({ title: z.string(), description: z.string(), amount: z.coerce.number().min(0), optional: z.boolean(), selected: z.boolean() }))
    .max(50)
    .default([]),
  ends_after_months: z.coerce.number().int().min(1).max(120).nullable().default(null),
});

export async function saveTemplate(input: z.input<typeof templateSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireMember("member");
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form");
  const { id, ...row } = parsed.data;
  const payload = { ...row, items: cleanItems(row.items) };
  const res = id
    ? await supabase.from("agreement_templates").update(payload).eq("id", id).select("id").single()
    : await supabase.from("agreement_templates").insert(payload).select("id").single();
  if (res.error) return fail(res.error.code === "23505" ? "A template with that name exists" : res.error.message);
  revalidatePath("/agreements/templates");
  return { ok: true, id: res.data.id as string };
}

export async function deleteTemplate(id: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("agreement_templates").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/agreements/templates");
  return { ok: true };
}

/** If sealing failed after the last signature (e.g. a timeout), finish it from the agreement page. */
export async function finishSealing(id: string): Promise<Result> {
  const { supabase } = await requireMember("member");
  const [{ data: a }, { data: left }] = await Promise.all([
    supabase.from("agreements").select("status, final_hash").eq("id", id).single(),
    supabase.from("agreement_signers").select("id").eq("agreement_id", id).is("signed_at", null),
  ]);
  if (!a || a.final_hash || left?.length || !["sent", "signed"].includes(a.status)) return fail("Nothing to finish");
  try {
    await completeAgreement(createAdminClient(), id);
  } catch (e) {
    return fail((e as Error).message);
  }
  refresh(id);
  return { ok: true };
}

/** Signed proposal → a draft quote with the chosen lines, linked back to the proposal. */
export async function quoteFromProposal(id: string): Promise<Result<{ id: string }>> {
  const { supabase } = await requireMember("member");
  const { data: a } = await supabase.from("agreements").select("*").eq("id", id).single();
  if (!a || a.kind !== "proposal" || a.status !== "signed") return fail("Only a signed proposal can become a quote");
  if (a.quote_id) return { ok: true, id: a.quote_id as string };
  if (!a.client_id) return fail("Link the proposal to a client first (make the client from the lead, then duplicate the proposal)");
  const [{ data: client }, settings] = await Promise.all([supabase.from("clients").select("*").eq("id", a.client_id).single(), getSettings()]);
  if (!client) return fail("Client not found");
  const chosen = priceTotals(cleanItems(a.items), Number(a.gst_rate)).chosen;
  if (!chosen.length) return fail("The proposal has no pricing lines");
  const abroad = client.country !== "India";
  const place = abroad ? OUTSIDE_INDIA : client.state_code || settings.state_code;
  const exportType = abroad ? (settings.lut_number ? "lut" : "igst") : "none";
  const today = todayIso();
  const res = await saveDocument({
    doc_type: "quote",
    number: null,
    client_id: client.id,
    client: {
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      city: client.city,
      pin: client.pin,
      state_code: client.state_code,
      country: client.country,
      gstin: client.gstin,
    },
    bank_account_id: null,
    project_id: a.project_id,
    source_id: null,
    source_relation: null,
    issue_date: today,
    due_date: null,
    valid_until: addDays(today, 15),
    currency: a.currency,
    fx_rate: 1,
    place_of_supply: place,
    reverse_charge: false,
    export_type: exportType,
    gst_mode: autoGstMode(settings.state_code, place, exportType),
    gst_rate: Number(a.gst_rate),
    discount_type: "none",
    discount_value: 0,
    round_off: true,
    notes: `As accepted in proposal ${a.number}.`,
    terms: settings.terms.quote ?? "",
    payment_terms: "50% advance, balance on delivery",
    custom_fields: [],
    reminders_enabled: true,
    recurring: null,
    items: chosen.map((i) => ({ title: i.title, description: i.description, sac: settings.default_sac, qty: 1, unit_price: i.amount })),
  });
  if (!res.ok) return fail(res.message);
  await supabase.from("agreements").update({ quote_id: res.id }).eq("id", id);
  refresh(id);
  return { ok: true, id: res.id };
}
