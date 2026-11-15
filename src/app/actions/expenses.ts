"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSettings, requireMember, requireTeam } from "@/lib/data";
import { vendorTotals } from "@/lib/expense-data";
import { match2b, purchaseGst, readPortal2b, rebillLines, suggestTds, tdsNature } from "@/lib/expenses";
import { OUTSIDE_INDIA, autoGstMode, checkGstin } from "@/lib/gst";
import { addDays, round2, todayIso } from "@/lib/money";
import { saveDocument } from "./documents";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });
const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join(", ");
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const opt = <T extends z.ZodTypeAny>(s: T) =>
  s
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null);

function refresh() {
  revalidatePath("/expenses");
  revalidatePath("/vendors");
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
const vendorSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  kind: z.enum(["freelancer", "vendor", "landlord", "utility", "software", "other"]).default("vendor"),
  gstin: z.string().trim().toUpperCase().default(""),
  pan: z.string().trim().toUpperCase().default(""),
  state_code: z.string().trim().default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  address: z.string().trim().default(""),
  bank_details: z.string().trim().default(""),
  upi_id: z.string().trim().default(""),
  default_category_id: opt(uuid),
  tds_nature: z.string().default("none"),
  is_company: z.boolean().default(false),
  msme: z.boolean().default(false),
  notes: z.string().trim().default(""),
});

export async function saveVendor(input: z.input<typeof vendorSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireMember("admin");
  const parsed = vendorSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const v = parsed.data;
  if (v.gstin) {
    const g = checkGstin(v.gstin);
    if (!g.ok) return fail(`GSTIN: ${g.reason}`);
    v.state_code = v.gstin.slice(0, 2);
    if (!v.pan) v.pan = v.gstin.slice(2, 12);
  }
  if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan)) return fail("PAN should look like ABCDE1234F");
  // the 4th letter of a PAN says who holds it: P = person, C = company, F = firm…
  if (v.pan && !input.is_company) v.is_company = !["P", "H"].includes(v.pan[3]);
  const { id, ...row } = v;
  const { data, error } = id ? await supabase.from("vendors").update(row).eq("id", id).select("id").single() : await supabase.from("vendors").insert(row).select("id").single();
  if (error) return fail(error.message);
  refresh();
  return { ok: true, id: data.id as string };
}

export async function deleteVendor(id: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { count } = await supabase.from("expenses").select("id", { count: "exact", head: true }).eq("vendor_id", id);
  if (count) return fail("This vendor has expenses. Keep it for your records.");
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

export async function saveCategory(input: {
  id?: string;
  name: string;
  itc_rule: string;
  kind: string;
  tds_nature: string;
  rcm: boolean;
  budget_month: number;
  active: boolean;
}): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const row = {
    name: input.name.trim(),
    itc_rule: ["eligible", "blocked", "none"].includes(input.itc_rule) ? input.itc_rule : "eligible",
    kind: input.kind === "pass_through" ? "pass_through" : "overhead",
    tds_nature: tdsNature(input.tds_nature).code,
    rcm: !!input.rcm,
    budget_month: Math.max(0, Number(input.budget_month) || 0),
    active: input.active !== false,
  };
  if (!row.name) return fail("Name is required");
  const { error } = input.id ? await supabase.from("expense_categories").update(row).eq("id", input.id) : await supabase.from("expense_categories").insert(row);
  if (error) return fail(error.code === "23505" ? "A category with that name exists" : error.message);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
const expenseSchema = z.object({
  id: uuid.optional(),
  kind: z.enum(["bill", "receipt", "claim"]),
  vendor_id: opt(uuid),
  vendor_name: z.string().trim().max(200).default(""),
  category_id: uuid,
  expense_date: isoDate,
  bill_no: z.string().trim().max(40).default(""),
  description: z.string().trim().max(500).default(""),
  project_id: opt(uuid),
  client_id: opt(uuid),
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  fx_rate: z.coerce.number().positive().default(1),
  taxable: z.coerce.number().min(0.01, "Enter the amount"),
  gst_rate: z.coerce.number().min(0).max(40).default(0),
  rcm: z.boolean().default(false),
  itc_status: z.enum(["eligible", "blocked", "ineligible"]).default("eligible"),
  itc_month: opt(isoDate),
  tds_nature: z.string().default("none"),
  tds_rate: z.coerce.number().min(0).max(30).default(0),
  paid_from: z.enum(["bank", "petty_cash", "member"]).default("bank"),
  due_date: opt(isoDate),
  billable: z.boolean().default(false),
  markup_pct: z.coerce.number().min(0).max(500).default(0),
  recurring: z
    .object({ every: z.enum(["month", "quarter", "year"]), next: isoDate })
    .nullable()
    .default(null),
  notes: z.string().trim().max(2000).default(""),
  /** Receipts: record the payment straight away from this account. */
  pay_now: z
    .object({ account_id: opt(uuid), mode: z.enum(["upi", "bank", "cash", "card", "cheque"]), reference: z.string().default("") })
    .nullable()
    .default(null),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

/** Saves a bill, receipt or claim. GST and TDS are worked out on the server. */
export async function saveExpense(input: ExpenseInput): Promise<Result<{ id: string }>> {
  const ctx = await requireTeam();
  // Only the admin records spend; members and freelancers file claims for what they paid.
  const { supabase, email, isAdmin: canEdit, role } = ctx;
  if (role === "viewer") return fail("Viewers can't add expenses");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { id, pay_now, ...e } = parsed.data;
  if (!canEdit && e.kind !== "claim") return fail("You can file claims for money you spent; bills are added by the studio.");

  const settings = await getSettings().catch(() => null);
  const ourState = settings?.state_code ?? "21";
  let supplierState = "";
  let vendor: { state_code: string; pan: string; is_company: boolean; gstin: string } | null = null;
  if (e.vendor_id && canEdit) {
    const { data } = await supabase.from("vendors").select("state_code, pan, is_company, gstin, name").eq("id", e.vendor_id).single();
    vendor = data;
    supplierState = data?.state_code ?? "";
    if (data && !e.vendor_name) e.vendor_name = data.name;
  }
  const unregistered = !!vendor && !vendor.gstin;
  const gst = purchaseGst({ taxable: e.taxable, rate: unregistered && !e.rcm ? 0 : e.gst_rate, supplierState, ourState, rcm: e.rcm });
  const tdsAmount = round2((e.taxable * (e.tds_nature === "none" ? 0 : e.tds_rate)) / 100);

  const claim = e.kind === "claim";
  const row: Record<string, unknown> = {
    ...e,
    gst_rate: unregistered && !e.rcm ? 0 : e.gst_rate,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    total: gst.total,
    itc_status: gst.tax === 0 ? "ineligible" : e.itc_status,
    tds_nature: claim ? "none" : e.tds_nature,
    tds_rate: claim || e.tds_nature === "none" ? 0 : e.tds_rate,
    tds_amount: claim ? 0 : tdsAmount,
    is_draft: false,
    paid_from: claim ? "member" : e.paid_from === "member" ? "bank" : e.paid_from,
    paid_by_email: claim ? email : null,
    approval: claim ? "submitted" : null,
    approval_note: "",
  };
  // staff correcting someone's claim keep its approval state and owner
  if (id && claim && canEdit) {
    delete row.approval;
    delete row.paid_by_email;
    delete row.approval_note;
  }

  let expenseId = id;
  if (id) {
    const { error } = await supabase.from("expenses").update(row).eq("id", id);
    if (error) return fail(error.message.replace(/^.*?: /, ""));
  } else {
    const { data, error } = await supabase.from("expenses").insert(row).select("id").single();
    if (error) return fail(error.message);
    expenseId = data.id as string;
  }
  if (!id && e.kind === "receipt" && pay_now && canEdit) {
    const amount = round2(gst.total - tdsAmount);
    if (amount > 0) {
      const { error } = await supabase
        .from("expense_payments")
        .insert({ expense_id: expenseId, paid_on: e.expense_date, amount, mode: pay_now.mode, account_id: pay_now.account_id, reference: pay_now.reference });
      if (error) return fail(`Saved, but recording the payment failed: ${error.message}`);
    }
  }
  if (!id && e.kind === "claim") {
    const { data: people } = await supabase.rpc("team_directory");
    const admin = ((people ?? []) as { email: string; role: string }[]).find((p) => p.role === "admin");
    if (admin && admin.email !== email) {
      await supabase.from("notifications").insert({
        recipient_email: admin.email,
        kind: "claim_submitted",
        title: `${email.split("@")[0]} filed a claim: ₹${gst.total.toLocaleString("en-IN")}`,
        body: e.description,
        link: "/expenses/claims",
      });
    }
  }
  refresh();
  return { ok: true, id: expenseId! };
}

export async function deleteExpense(id: string): Promise<Result> {
  const { supabase } = await requireTeam();
  const { data: e } = await supabase.from("expenses").select("receipt_path").eq("id", id).single();
  const { error, count } = await supabase.from("expenses").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message.replace(/^.*?: /, ""));
  if (!count) return fail("You can't delete this expense.");
  if (e?.receipt_path) await supabase.storage.from("files").remove([e.receipt_path]);
  refresh();
  return { ok: true };
}

/** Called after the browser uploads a receipt straight to Storage. */
export async function attachReceipt(expenseId: string, path: string, name: string): Promise<Result> {
  const { supabase } = await requireTeam();
  if (!path.startsWith(`expenses/${expenseId}/`)) return fail("Bad upload path");
  const { data: old } = await supabase.from("expenses").select("receipt_path").eq("id", expenseId).single();
  const { error } = await supabase
    .from("expenses")
    .update({ receipt_path: path, receipt_name: name.slice(0, 200) })
    .eq("id", expenseId);
  if (error) {
    await supabase.storage.from("files").remove([path]);
    return fail(error.message);
  }
  if (old?.receipt_path && old.receipt_path !== path) await supabase.storage.from("files").remove([old.receipt_path]);
  revalidatePath(`/expenses/${expenseId}`);
  return { ok: true };
}

export async function receiptUrl(expenseId: string): Promise<Result<{ url: string }>> {
  const { supabase } = await requireTeam();
  const { data: e } = await supabase.from("expenses").select("receipt_path, receipt_name").eq("id", expenseId).single();
  if (!e?.receipt_path) return fail("No receipt attached");
  const { data, error } = await supabase.storage.from("files").createSignedUrl(e.receipt_path, 300);
  if (error || !data) return fail(error?.message ?? "Couldn't open the receipt");
  return { ok: true, url: data.signedUrl };
}

/** TDS hint for the form: how much this vendor has billed this FY/month already. */
export async function tdsHint(vendorId: string, date: string, taxable: number, nature: string, excludeId?: string) {
  const { supabase } = await requireMember("admin");
  const [{ data: v }, totals] = await Promise.all([supabase.from("vendors").select("pan, is_company").eq("id", vendorId).single(), vendorTotals(vendorId, date, excludeId)]);
  const s = suggestTds({ nature, taxable, isCompany: !!v?.is_company, hasPan: !!v?.pan, paidThisYear: totals.year, paidThisMonth: totals.month });
  return { ...s, paidThisYear: round2(totals.year) };
}

// ---------------------------------------------------------------------------
// Claims and payments
// ---------------------------------------------------------------------------
export async function decideClaims(ids: string[], approve: boolean, note = ""): Promise<Result<{ count: number }>> {
  const { supabase } = await requireMember("admin");
  if (!ids.length) return fail("Nothing selected");
  const { data, error } = await supabase
    .from("expenses")
    .update({ approval: approve ? "approved" : "rejected", approval_note: note })
    .in("id", ids)
    .eq("kind", "claim")
    .eq("approval", "submitted")
    .select("created_by, total, description");
  if (error) return fail(error.message.replace(/^.*?: /, ""));
  if (data?.length) {
    await supabase.from("notifications").insert(
      data.map((c) => ({
        recipient_email: c.created_by,
        kind: "claim_decided",
        title: `Claim ${approve ? "approved" : "sent back"}: ₹${Number(c.total).toLocaleString("en-IN")}`,
        body: approve ? c.description : note || c.description,
        link: "/expenses/claims",
      })),
    );
  }
  refresh();
  return { ok: true, count: data?.length ?? 0 };
}

const paymentSchema = z.object({
  paid_on: isoDate,
  amount: z.coerce.number().positive("Amount must be more than 0"),
  mode: z.enum(["upi", "bank", "cash", "card", "cheque"]),
  account_id: opt(uuid),
  reference: z.string().trim().max(100).default(""),
});

export async function recordExpensePayment(expenseId: string, input: z.input<typeof paymentSchema>): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return fail(issues(parsed.error));
  const { data: e } = await supabase.from("expenses").select("kind, approval").eq("id", expenseId).single();
  if (e?.kind === "claim" && e.approval !== "approved") return fail("Approve the claim before paying it.");
  const { data: bal } = await supabase.from("expense_balances").select("balance").eq("expense_id", expenseId).single();
  if (bal && parsed.data.amount > Number(bal.balance) + 0.5) return fail(`That's more than the ₹${Number(bal.balance).toLocaleString("en-IN")} still owed.`);
  const { error } = await supabase.from("expense_payments").insert({ expense_id: expenseId, ...parsed.data });
  if (error) return fail(error.code === "42501" ? "Only the admin pays team claims." : error.message);
  refresh();
  revalidatePath(`/expenses/${expenseId}`);
  return { ok: true };
}

export async function deleteExpensePayment(id: string, expenseId: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { error, count } = await supabase.from("expense_payments").delete({ count: "exact" }).eq("id", id);
  if (error) return fail(error.message);
  if (!count) return fail("You can't remove this payment.");
  revalidatePath(`/expenses/${expenseId}`);
  refresh();
  return { ok: true };
}

/** Admin: reimburse several approved claims at once (one payment each, same date and reference). */
export async function payClaims(ids: string[], input: Omit<z.input<typeof paymentSchema>, "amount">): Promise<Result<{ count: number; total: number }>> {
  const { supabase } = await requireMember("admin");
  const { data: bals } = await supabase.from("expense_balances").select("expense_id, balance").in("expense_id", ids);
  const { data: claims } = await supabase.from("expenses").select("id, created_by").in("id", ids).eq("kind", "claim").eq("approval", "approved");
  const ok = new Set((claims ?? []).map((c) => c.id as string));
  const rows = (bals ?? [])
    .filter((b) => ok.has(b.expense_id as string) && Number(b.balance) > 0.005)
    .map((b) => ({
      expense_id: b.expense_id,
      amount: Number(b.balance),
      paid_on: input.paid_on,
      mode: input.mode,
      account_id: input.account_id || null,
      reference: input.reference ?? "",
    }));
  if (!rows.length) return fail("Nothing approved and unpaid in the selection.");
  const { error } = await supabase.from("expense_payments").insert(rows);
  if (error) return fail(error.message);
  const people = [...new Set((claims ?? []).filter((c) => rows.some((r) => r.expense_id === c.id)).map((c) => c.created_by as string))];
  await supabase
    .from("notifications")
    .insert(people.map((p) => ({ recipient_email: p, kind: "claim_paid", title: "Your claim was reimbursed", body: input.reference ?? "", link: "/expenses/claims" })));
  refresh();
  return { ok: true, count: rows.length, total: round2(rows.reduce((s, r) => s + r.amount, 0)) };
}

/** Confirms a recurring copy the daily job drafted. */
export async function confirmDraft(id: string): Promise<Result> {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("expenses").update({ is_draft: false }).eq("id", id);
  if (error) return fail(error.message);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Re-bill to a client
// ---------------------------------------------------------------------------
/** Drafts a GST invoice for a project's billable, not-yet-invoiced expenses (with markup). */
export async function invoiceFromExpenses(projectId: string): Promise<Result<{ id: string; count: number }>> {
  const { supabase } = await requireMember("admin");
  const [{ data: project }, { data: rows }, settings] = await Promise.all([
    supabase.from("projects").select("id, name, code, client_id").eq("id", projectId).single(),
    supabase
      .from("expenses")
      .select("id, description, taxable, total, rcm, itc_status, markup_pct, fx_rate, vendor_name, expense_categories(name), vendors(name), approval, kind")
      .eq("project_id", projectId)
      .eq("billable", true)
      .is("invoiced_document_id", null),
    getSettings(),
  ]);
  if (!project) return fail("Project not found");
  if (!project.client_id) return fail("Pick a client for this project first (Overview → Edit).");
  const usable = (rows ?? []).filter((r) => r.kind !== "claim" || r.approval === "approved");
  if (!usable.length) return fail("No billable expenses waiting on this project.");
  const items = rebillLines(
    usable.map((r) => ({
      category: (r.expense_categories as { name?: string } | null)?.name ?? "Expense",
      description: r.description as string,
      vendor: (r.vendors as { name?: string } | null)?.name ?? (r.vendor_name as string),
      taxable: Number(r.taxable),
      total: Number(r.total),
      rcm: !!r.rcm,
      itc_status: r.itc_status as "eligible",
      markup_pct: Number(r.markup_pct),
      fx_rate: Number(r.fx_rate) || 1,
    })),
    settings.default_sac,
  );
  const { data: client } = await supabase.from("clients").select("*").eq("id", project.client_id).single();
  if (!client) return fail("Client not found");
  const abroad = client.country !== "India";
  const place = abroad ? OUTSIDE_INDIA : client.state_code || settings.state_code;
  const exportType = abroad ? (settings.lut_number ? "lut" : "igst") : "none";
  const today = todayIso();
  const res = await saveDocument({
    doc_type: "invoice",
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
    project_id: projectId,
    source_id: null,
    source_relation: null,
    issue_date: today,
    due_date: addDays(today, settings.default_due_days),
    valid_until: null,
    currency: "INR",
    fx_rate: 1,
    place_of_supply: place,
    reverse_charge: false,
    export_type: exportType,
    gst_mode: autoGstMode(settings.state_code, place, exportType),
    gst_rate: settings.default_gst_rate,
    discount_type: "none",
    discount_value: 0,
    round_off: true,
    notes: `Expenses for ${project.code} · ${project.name}.`,
    terms: settings.terms.invoice ?? "",
    payment_terms: settings.default_due_days === 0 ? "Due on receipt" : `Net ${settings.default_due_days}`,
    custom_fields: [],
    reminders_enabled: true,
    recurring: null,
    items,
  });
  if (!res.ok) return fail(res.message);
  // claim only the expenses nobody else invoiced meanwhile (a double-click would otherwise bill them twice)
  const { data: claimed, error } = await supabase
    .from("expenses")
    .update({ invoiced_document_id: res.id })
    .in(
      "id",
      usable.map((r) => r.id as string),
    )
    .is("invoiced_document_id", null)
    .select("id");
  if (error || (claimed ?? []).length !== usable.length) {
    if ((claimed ?? []).length) await supabase.from("expenses").update({ invoiced_document_id: null }).eq("invoiced_document_id", res.id);
    await supabase.from("document_items").delete().eq("document_id", res.id);
    await supabase.from("documents").delete().eq("id", res.id).eq("status", "draft");
    return fail(error ? `Couldn't link the expenses: ${error.message}` : "These expenses were just invoiced in another tab. Refresh to see that invoice.");
  }
  revalidatePath(`/projects/${projectId}`);
  refresh();
  return { ok: true, id: res.id, count: usable.length };
}

// ---------------------------------------------------------------------------
// GST: GSTR-2B matching and ITC month; TDS challans
// ---------------------------------------------------------------------------
/** Matches bills with a GSTIN in [from, to] against the 2B CSV from the GST portal and saves the result. */
export async function reconcile2b(
  csv: string,
  from: string,
  to: string,
): Promise<Result<{ matched: number; mismatch: number; missing: number; notInBooks: { gstin: string; invoice_no: string; tax: number }[] }>> {
  const { supabase } = await requireMember("admin");
  const portal = readPortal2b(csv);
  if (!portal.length)
    return fail("Couldn't find B2B lines in that file. Download GSTR-2B from the GST portal, open it in Excel or Sheets, save the B2B sheet as CSV, and upload that.");
  const { data } = await supabase
    .from("expenses")
    .select("id, bill_no, cgst, sgst, igst, itc_status, vendors(gstin)")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .neq("itc_status", "ineligible");
  const ours = (data ?? [])
    .map((e) => ({
      id: e.id as string,
      gstin: ((e.vendors as { gstin?: string } | null)?.gstin ?? "") as string,
      bill_no: e.bill_no as string,
      tax: Number(e.cgst) + Number(e.sgst) + Number(e.igst),
    }))
    .filter((e) => e.gstin && e.tax > 0);
  const m = match2b(ours, portal);
  for (const status of ["matched", "mismatch", "missing"] as const) {
    const ids = m.results.filter((r) => r.status === status).map((r) => r.id);
    if (!ids.length) continue;
    const { error } = await supabase.from("expenses").update({ gstr2b: status }).in("id", ids);
    if (error) return fail(`Matching stopped part-way: ${error.message}`);
  }
  refresh();
  const count = (s: string) => m.results.filter((r) => r.status === s).length;
  return {
    ok: true,
    matched: count("matched"),
    mismatch: count("mismatch"),
    missing: count("missing"),
    notInBooks: m.notInBooks.map((p) => ({ gstin: p.gstin, invoice_no: p.invoice_no, tax: p.tax })),
  };
}

export async function saveChallan(input: { month: string; amount: number; challan_no: string; bsr_code: string; paid_on: string; expense_ids: string[] }): Promise<Result> {
  const { supabase } = await requireMember("admin");
  if (!/^\d{4}-\d{2}-01$/.test(input.month) || !isoDate.safeParse(input.paid_on).success || !(input.amount > 0)) return fail("Month, amount and payment date are required");
  const { data, error } = await supabase
    .from("tds_challans")
    .insert({ month: input.month, amount: input.amount, challan_no: input.challan_no, bsr_code: input.bsr_code, paid_on: input.paid_on })
    .select("id")
    .single();
  if (error) return fail(error.message);
  if (input.expense_ids.length) {
    const { error: linkErr } = await supabase.from("expenses").update({ tds_challan_id: data.id }).in("id", input.expense_ids);
    if (linkErr) {
      await supabase.from("tds_challans").delete().eq("id", data.id); // don't leave a challan that covers nothing
      return fail(`Couldn't link the deductions: ${linkErr.message}`);
    }
  }
  refresh();
  return { ok: true };
}
