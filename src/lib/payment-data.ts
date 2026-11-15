import "server-only";
import { requireMember } from "./data";
import { fetchAll } from "./fetch-all";
import { todayIso } from "./money";
import { payTargets, type PaymentLine } from "./payments";
import { projectFee } from "./projects";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

/** Every payment (admin only), newest first, in INR, with its client, project and invoice. */
export async function listPaymentLines(): Promise<PaymentLine[]> {
  const { supabase } = await requireMember("admin");
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from("payments")
      .select("id, paid_on, amount, tds_amount, mode, reference, note, file_name, project_id, document_id, documents(number, currency, fx_rate, client_snapshot), projects(code, name, clients(name))")
      .order("paid_on", { ascending: false })
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => {
    const d = r.documents as { number: string; currency: string; fx_rate: number; client_snapshot: { name?: string } | null } | null;
    const p = r.projects as { code: string; name: string; clients: { name: string } | null } | null;
    const fx = d && d.currency !== "INR" ? n(d.fx_rate) || 1 : 1;
    return {
      id: r.id as string,
      paid_on: r.paid_on as string,
      amount: Math.round(n(r.amount) * fx * 100) / 100,
      tds: Math.round(n(r.tds_amount) * fx * 100) / 100,
      mode: r.mode as string,
      reference: (r.reference as string) ?? "",
      note: (r.note as string) ?? "",
      client: d?.client_snapshot?.name || p?.clients?.name || "",
      project: p && r.project_id ? { id: r.project_id as string, code: p.code, name: p.name } : null,
      invoice: d && r.document_id ? { id: r.document_id as string, number: d.number } : null,
      file_name: (r.file_name as string) ?? "",
    };
  });
}

/** Projects and loose invoices that can be paid, with what each still owes. */
export async function loadPayTargets(lines: PaymentLine[]) {
  const { supabase } = await requireMember("admin");
  const today = todayIso();
  const [projects, invoices, balances] = await Promise.all([
    fetchAll<Row>((a, b) =>
      supabase.from("projects").select("id, code, name, start_date, due_date, clients(name), project_finance(budget, billing, retainer_amount_month)").neq("status", "cancelled").order("id").range(a, b),
    ),
    fetchAll<Row>((a, b) =>
      supabase.from("documents").select("id, number, project_id, client_snapshot, currency, fx_rate").eq("doc_type", "invoice").eq("status", "issued").order("id").range(a, b),
    ),
    fetchAll<Row>((a, b) => supabase.from("document_balances").select("id, balance").gt("balance", 0).order("id").range(a, b)),
  ]);
  const received = new Map<string, number>();
  for (const l of lines) if (l.project) received.set(l.project.id, (received.get(l.project.id) ?? 0) + l.amount + l.tds);
  const balance = new Map(balances.map((b) => [b.id as string, n(b.balance)]));
  return payTargets(
    projects.map((p) => {
      const f = (Array.isArray(p.project_finance) ? p.project_finance[0] : p.project_finance) as Row | null;
      const fee = projectFee(f ? { budget: n(f.budget), billing: f.billing as string, retainer_amount_month: n(f.retainer_amount_month) } : null, p as { start_date: string | null; due_date: string | null }, today);
      return { id: p.id as string, code: p.code as string, name: p.name as string, client: (p.clients as { name: string } | null)?.name ?? "", fee, received: received.get(p.id as string) ?? 0 };
    }),
    invoices.map((i) => ({
      id: i.id as string,
      number: i.number as string,
      client: (i.client_snapshot as { name?: string } | null)?.name ?? "",
      project_id: (i.project_id as string) ?? null,
      balance: (balance.get(i.id as string) ?? 0) * (i.currency !== "INR" ? n(i.fx_rate) || 1 : 1),
    })),
  );
}
