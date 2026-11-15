import "server-only";
import type { ADoc, AExp, APay } from "./analytics";
import type { Lead } from "./crm";
import { requireMember } from "./data";
import { fetchAll } from "./fetch-all";
import { addDays } from "./money";

type Row = Record<string, unknown>;
const all = (page: Parameters<typeof fetchAll<Row>>[0]) => fetchAll<Row>(page).then((data) => ({ data }));
const n = (v: unknown) => Number(v ?? 0);

/** Everything Reports needs, in one round of parallel queries. */
export async function loadAnalytics(opts: { since: string; until: string; weeksFrom: string }) {
  const { supabase, isAdmin } = await requireMember();
  const [docs, bals, pays, exps, expBals, expPays, accounts, projects, tasks, time, capacity, leave, holidays, leads] = await Promise.all([
    // money tables are paged in: Supabase stops at 1,000 rows without saying so
    all((a, b) =>
      supabase
        .from("documents")
        .select("id, doc_type, status, client_id, client_snapshot, project_id, issue_date, due_date, currency, fx_rate, taxable, total, source_id, source_relation, recurring")
        .neq("status", "draft")
        .order("id")
        .range(a, b),
    ),
    all((a, b) => supabase.from("document_balances").select("id, balance").order("id").range(a, b)),
    all((a, b) => supabase.from("payments").select("document_id, project_id, paid_on, amount, tds_amount").order("id").range(a, b)),
    all((a, b) =>
      supabase
        .from("expenses")
        .select(
          "id, expense_date, project_id, taxable, total, itc_status, rcm, fx_rate, kind, approval, is_draft, due_date, recurring, tds_amount, tds_challan_id, expense_categories(name, kind, budget_month)",
        )
        .order("id")
        .range(a, b),
    ),
    all((a, b) => supabase.from("expense_balances").select("expense_id, balance").order("expense_id").range(a, b)),
    all((a, b) => supabase.from("expense_payments").select("paid_on, amount").order("id").range(a, b)),
    supabase.from("bank_accounts").select("opening_balance, opening_date"),
    supabase.from("projects").select("id, code, name, status, client_id, clients(name)"),
    supabase.from("tasks").select("due_date, completed_at").not("completed_at", "is", null).gte("completed_at", `${opts.since}T00:00:00Z`),
    supabase.from("time_entries").select("member_email, work_date, minutes").is("timer_started_at", null).neq("status", "rejected").gte("work_date", opts.weeksFrom),
    supabase.rpc("team_capacity"),
    supabase.from("leave_requests").select("member_email, from_date, to_date, half_day, status").eq("status", "approved").gte("to_date", opts.weeksFrom),
    supabase.from("holidays").select("day"),
    supabase.from("leads").select("stage, furthest_stage, source, value, created_at, won_at"),
  ]);

  const balance = new Map(((bals.data ?? []) as Row[]).map((b) => [b.id as string, n(b.balance)]));
  const aDocs: ADoc[] = ((docs.data ?? []) as Row[]).map((d) => ({
    id: d.id as string,
    doc_type: d.doc_type as string,
    status: d.status as string,
    client_id: (d.client_id as string) ?? null,
    client_name: ((d.client_snapshot as { name?: string } | null)?.name ?? "") as string,
    project_id: (d.project_id as string) ?? null,
    issue_date: d.issue_date as string,
    due_date: (d.due_date as string) ?? null,
    currency: d.currency as string,
    fx_rate: n(d.fx_rate) || 1,
    taxable: n(d.taxable),
    total: n(d.total),
    source_id: (d.source_id as string) ?? null,
    source_relation: (d.source_relation as string) ?? null,
    recurring: (d.recurring as ADoc["recurring"]) ?? null,
    balance: balance.has(d.id as string) ? balance.get(d.id as string)! : null,
  }));
  const aPays: APay[] = ((pays.data ?? []) as Row[]).map((p) => ({
    document_id: (p.document_id as string) ?? null,
    project_id: (p.project_id as string) ?? null,
    paid_on: p.paid_on as string,
    amount: n(p.amount),
    tds_amount: n(p.tds_amount),
  }));
  const expBalance = new Map(((expBals.data ?? []) as Row[]).map((b) => [b.expense_id as string, n(b.balance)]));
  const budgets = new Map<string, number>();
  const aExps: AExp[] = ((exps.data ?? []) as Row[]).map((e) => {
    const c = e.expense_categories as { name: string; kind: "overhead" | "pass_through"; budget_month: number } | null;
    if (c && n(c.budget_month) > 0) budgets.set(c.name, n(c.budget_month));
    return {
      expense_date: e.expense_date as string,
      category: c?.name ?? "Other",
      category_kind: c?.kind ?? "overhead",
      project_id: (e.project_id as string) ?? null,
      taxable: n(e.taxable),
      total: n(e.total),
      itc_status: e.itc_status as string,
      rcm: !!e.rcm,
      fx_rate: n(e.fx_rate) || 1,
      kind: e.kind as string,
      approval: (e.approval as string) ?? null,
      is_draft: !!e.is_draft,
      due_date: (e.due_date as string) ?? null,
      balance: expBalance.get(e.id as string) ?? 0,
      recurring: (e.recurring as AExp["recurring"]) ?? null,
      tds_amount: n(e.tds_amount),
      tds_challan_id: (e.tds_challan_id as string) ?? null,
    };
  });
  const acc = (accounts.data ?? []) as Row[];
  const openingDates = acc.map((a) => a.opening_date as string | null).filter(Boolean) as string[];
  return {
    isAdmin,
    leads: ((leads.data ?? []) as Row[]).map((l) => ({ ...(l as unknown as Pick<Lead, "stage" | "furthest_stage" | "source" | "created_at" | "won_at">), value: n(l.value) })),
    docs: aDocs,
    pays: aPays,
    exps: aExps,
    budgets,
    payouts: ((expPays.data ?? []) as Row[]).map((p) => ({ date: p.paid_on as string, amount: n(p.amount) })),
    opening: {
      amount: acc.reduce((s, a) => s + n(a.opening_balance), 0),
      date: openingDates.length ? openingDates.sort()[0] : null,
      set: acc.some((a) => n(a.opening_balance) !== 0),
    },
    projects: ((projects.data ?? []) as Row[]).map((p) => ({
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      status: p.status as string,
      client_id: (p.client_id as string) ?? null,
      client_name: (p.clients as { name?: string } | null)?.name ?? "",
    })),
    tasks: (tasks.data ?? []) as { due_date: string | null; completed_at: string | null }[],
    time: ((time.data ?? []) as Row[]).map((t) => ({ member_email: t.member_email as string, work_date: t.work_date as string, minutes: n(t.minutes) })),
    capacity: new Map(((capacity.data ?? []) as Row[]).map((c) => [c.email as string, n(c.weekly_capacity_hours)])),
    leave: (leave.data ?? []) as { member_email: string; from_date: string; to_date: string; half_day: boolean; status: "approved" }[],
    holidays: ((holidays.data ?? []) as Row[]).map((h) => h.day as string),
  };
}

/** Invoice lines (INR, pre-GST, net of document discount) in a period, for revenue by service. */
export async function serviceLines(from: string, to: string) {
  const { supabase } = await requireMember();
  const { data } = await supabase
    .from("documents")
    .select("doc_type, currency, fx_rate, subtotal, taxable, document_items(title, amount)")
    .in("doc_type", ["invoice", "credit_note"])
    .in("status", ["issued", "accepted"])
    .gte("issue_date", from)
    .lte("issue_date", addDays(to, 0));
  const out: { title: string; amount: number }[] = [];
  for (const d of (data ?? []) as Row[]) {
    const fx = d.currency === "INR" ? 1 : n(d.fx_rate) || 1;
    const sign = d.doc_type === "credit_note" ? -1 : 1;
    const scale = n(d.subtotal) > 0 ? n(d.taxable) / n(d.subtotal) : 1;
    for (const i of (d.document_items as Row[]) ?? []) out.push({ title: String(i.title ?? ""), amount: sign * n(i.amount) * scale * fx });
  }
  return out;
}
