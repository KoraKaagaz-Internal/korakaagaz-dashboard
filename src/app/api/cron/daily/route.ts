import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PREFIXES, toDocument } from "@/lib/data";
import { copyDocumentToDraft } from "@/lib/doc-copy";
import { sendMail, splitEmails, textToHtml } from "@/lib/mail";
import { DEFAULT_MESSAGES, fillTemplate, messageValues } from "@/lib/messages";
import { nextRecurring } from "@/lib/expenses";
import { addDays, addMonths, daysBetween, todayIso } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Days relative to the due date on which a reminder goes out (negative = before). */
const REMINDER_OFFSETS = [-3, 0, 7, 14, 30];

/**
 * Runs once a day (Vercel Cron, 09:00 IST). Also keeps the free Supabase project from pausing.
 * ?dry=1 reports what would happen without sending or creating anything.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const today = request.nextUrl.searchParams.get("today") ?? todayIso();
  const supabase = createAdminClient();
  const report: Record<string, unknown[]> = { expired: [], reminders: [], recurring: [], recurringExpenses: [], errors: [] };

  const { data: settingsRow } = await supabase.from("settings").select("*").eq("id", 1).single();
  const settings = { ...(settingsRow as Settings), prefixes: { ...DEFAULT_PREFIXES, ...(settingsRow?.prefixes ?? {}) } };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  // 1. Expire quotes past their validity.
  const { data: stale } = await supabase.from("documents").select("id, number").eq("doc_type", "quote").eq("status", "issued").lt("valid_until", today);
  for (const q of stale ?? []) {
    report.expired.push(q.number);
    if (!dry) await supabase.from("documents").update({ status: "expired" }).eq("id", q.id);
  }

  // 2. Payment reminders.
  if (settings.reminders_enabled) {
    const { data: rows } = await supabase.from("documents").select("*").eq("doc_type", "invoice").eq("status", "issued").eq("reminders_enabled", true).not("due_date", "is", null);
    const ids = (rows ?? []).map((r) => r.id);
    const { data: bals } = ids.length ? await supabase.from("document_balances").select("*").in("id", ids) : { data: [] };
    const balById = new Map((bals ?? []).map((b) => [b.id, b]));
    for (const row of rows ?? []) {
      const doc = toDocument(row, balById.get(row.id));
      if (!doc.balance || doc.balance.balance <= 0.005 || !doc.due_date) continue;
      const offset = daysBetween(doc.due_date, today);
      if (!REMINDER_OFFSETS.includes(offset)) continue;
      const to = splitEmails(doc.client.email);
      if (!to.length) continue;
      const { count } = await supabase
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("document_id", doc.id)
        .eq("kind", "reminder")
        .gte("sent_at", `${today}T00:00:00+05:30`);
      if (count) continue;

      const values = messageValues(doc, settings.business_name, `${site}/d/${doc.share_token}`, today);
      const subject = fillTemplate(settings.message_templates?.reminder_subject || DEFAULT_MESSAGES.reminder_subject, values);
      const body = fillTemplate(settings.message_templates?.reminder_body || DEFAULT_MESSAGES.reminder_body, values);
      report.reminders.push({ number: doc.number, to, offset });
      if (dry) continue;
      const result = await sendMail({ to, subject, text: body, html: textToHtml(body) });
      await supabase.from("email_log").insert({
        document_id: doc.id,
        client_id: doc.client_id,
        kind: "reminder",
        to_email: to.join(", "),
        subject,
        status: result.status,
        error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : "",
        sent_by: null,
      });
    }
  }

  // 3. Recurring retainers: create drafts only, never issue or send.
  const { data: recurring } = await supabase.from("documents").select("id, number, recurring, status").not("recurring", "is", null).neq("status", "cancelled");
  for (const r of recurring ?? []) {
    const rule = r.recurring as { every: "month" | "quarter"; next: string };
    if (!rule?.next || rule.next > today) continue;
    report.recurring.push({ from: r.number, date: rule.next });
    if (dry) continue;
    const copy = await copyDocumentToDraft(supabase, r.id, { relation: "recurring_from", issue_date: rule.next, dueDays: settings.default_due_days, terms: settings.terms ?? {} });
    if (!copy.ok) {
      report.errors.push({ recurring: r.number, error: copy.message });
      continue;
    }
    await supabase
      .from("documents")
      .update({ recurring: { ...rule, next: addMonths(rule.next, rule.every === "quarter" ? 3 : 1) } })
      .eq("id", r.id);
    const note = `A draft for the next ${rule.every}ly invoice (from ${r.number ?? "a recurring invoice"}) is ready to review:\n${site}/documents/${copy.id}`;
    await sendMail({ to: [process.env.SMTP_USER || "team@korakaagaz.co"], subject: `Recurring draft ready: ${r.number ?? ""}`, text: note });
  }

  // 4. Recurring expenses (rent, subscriptions): a draft copy for a person to confirm.
  const { data: repeating } = await supabase.from("expenses").select("*").not("recurring", "is", null);
  for (const e of repeating ?? []) {
    const rule = e.recurring as { every: "month" | "quarter" | "year"; next: string };
    if (!rule?.next || rule.next > today) continue;
    report.recurringExpenses.push({ from: e.id, date: rule.next });
    if (dry) continue;
    const {
      id,
      created_at: _c,
      updated_at: _u,
      recurring: _r,
      receipt_path: _p,
      receipt_name: _n,
      gstr2b: _g,
      itc_month: _m,
      tds_challan_id: _t,
      invoiced_document_id: _i,
      approval: _a,
      decided_by: _d,
      decided_at: _da,
      ...copy
    } = e;
    void [_c, _u, _r, _p, _n, _g, _m, _t, _i, _a, _d, _da];
    const { error } = await supabase.from("expenses").insert({
      ...copy,
      expense_date: rule.next,
      due_date: e.due_date ? addDays(rule.next, Math.max(0, daysBetween(e.expense_date, e.due_date))) : null,
      recurring_source_id: id,
      is_draft: true,
      bill_no: "",
    });
    if (error) {
      report.errors.push({ recurringExpense: id, error: error.message });
      continue;
    }
    await supabase
      .from("expenses")
      .update({ recurring: { ...rule, next: nextRecurring(rule.next, rule.every) } })
      .eq("id", id);
    const { data: admin } = await supabase.from("members").select("email").eq("role", "admin").maybeSingle();
    if (admin)
      await supabase
        .from("notifications")
        .insert({
          recipient_email: admin.email,
          actor_email: admin.email,
          kind: "recurring_expense",
          title: `Recurring expense ready to confirm: ${e.description || e.vendor_name || "expense"}`,
          link: "/expenses?status=draft",
        });
  }

  // 5. Lead follow-ups due today: a nudge to each owner (overdue ones are on Home already).
  report.followUps = [];
  const { data: due } = await supabase
    .from("leads")
    .select("id, name, company, owner_email")
    .eq("follow_up_on", today)
    .in("stage", ["enquiry", "discovery", "proposal", "negotiation"]);
  for (const l of due ?? []) {
    if (!l.owner_email) continue;
    report.followUps.push({ lead: l.id });
    if (dry) continue;
    await supabase
      .from("notifications")
      .insert({ recipient_email: l.owner_email, actor_email: l.owner_email, kind: "follow_up", title: `Follow up today: ${l.company || l.name}`, link: `/crm/${l.id}` });
  }

  return NextResponse.json({ ok: true, dry, today, ...report });
}
