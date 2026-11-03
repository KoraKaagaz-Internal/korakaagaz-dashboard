import "server-only";
import { cleanItems, type Agreement, type AgreementKind, type Signer } from "./agreements";
import { requireMember } from "./data";
import { stateName } from "./gst";
import { formatInvoiceDate, formatMoney } from "./money";
import type { Settings } from "./types";

type Row = Record<string, unknown>;

export const SIGNER_COLUMNS = "id, position, party, name, email, viewed_at, verified_at, signed_at, signature_name, declined_at, decline_reason";
/** The signing certificate (service role) also prints where each person signed from. */
export const CERTIFICATE_SIGNER_COLUMNS = `${SIGNER_COLUMNS}, signed_ip`;

export function toAgreement(r: Row): Agreement {
  return {
    ...(r as unknown as Agreement),
    items: cleanItems(r.items),
    gst_rate: Number(r.gst_rate ?? 0),
    renewal_notice_days: Number(r.renewal_notice_days ?? 30),
  };
}

export interface AgreementRow extends Agreement {
  client_name: string;
  project_code: string;
  signers: Signer[];
}

export async function listAgreements(f: { status?: string; kind?: string; q?: string; client?: string; project?: string; lead?: string } = {}): Promise<AgreementRow[]> {
  const { supabase } = await requireMember();
  let q = supabase.from("agreements").select(`*, clients(name), projects(code), agreement_signers(${SIGNER_COLUMNS})`).order("created_at", { ascending: false }).limit(500);
  if (f.status) q = q.eq("status", f.status);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.client) q = q.eq("client_id", f.client);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.lead) q = q.eq("lead_id", f.lead);
  if (f.q) {
    const s = f.q.replace(/[%,()*]/g, " ").trim();
    if (s) q = q.or(`title.ilike.%${s}%,number.ilike.%${s}%`);
  }
  const { data } = await q;
  return ((data ?? []) as Row[]).map((r) => ({
    ...toAgreement(r),
    client_name: (r.clients as { name?: string } | null)?.name ?? "",
    project_code: (r.projects as { code?: string } | null)?.code ?? "",
    signers: ((r.agreement_signers as Signer[]) ?? []).sort((a, b) => a.position - b.position),
  }));
}

export interface AgreementEvent {
  id: number;
  at: string;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  hash: string;
}

export async function getAgreement(id: string) {
  const { supabase } = await requireMember();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [{ data }, { data: signers }, { data: events }] = await Promise.all([
    supabase.from("agreements").select("*, clients(name, email), projects(code, name), leads(name, company)").eq("id", id).maybeSingle(),
    supabase.from("agreement_signers").select(SIGNER_COLUMNS).eq("agreement_id", id).order("position"),
    supabase.from("agreement_events").select("id, at, action, actor, detail, hash").eq("agreement_id", id).order("id"),
  ]);
  if (!data) return null;
  const r = data as Row;
  return {
    agreement: toAgreement(r),
    client: r.clients as { name: string; email: string } | null,
    project: r.projects as { code: string; name: string } | null,
    lead: r.leads as { name: string; company: string } | null,
    signers: (signers ?? []) as Signer[],
    events: (events ?? []) as AgreementEvent[],
  };
}

export interface Template {
  id: string;
  name: string;
  kind: AgreementKind;
  description: string;
  body: string;
  items: ReturnType<typeof cleanItems>;
  ends_after_months: number | null;
}

export async function listTemplates(): Promise<Template[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("agreement_templates").select("*").order("sort").order("name");
  return ((data ?? []) as Row[]).map((t) => ({ ...(t as unknown as Template), items: cleanItems(t.items) }));
}

/** The city for "courts at …": the word before the PIN in the studio address, else the state. */
export function studioCity(s: Pick<Settings, "address" | "state_code">): string {
  const m = s.address.match(/([A-Za-z][A-Za-z .]+?)\s*[-–,]?\s*\d{6}/);
  if (m) return m[1].split(",").pop()!.trim();
  return stateName(s.state_code) || "";
}

/** Values for {{merge.fields}}. */
export function mergeValues(input: {
  title: string;
  today: string;
  settings: Settings;
  client: { name: string; address: string; city: string; pin: string; gstin: string } | null;
  project: { name: string } | null;
  fee: number | null;
  gstRate: number;
  validUntil: string | null;
  startsOn: string | null;
  endsOn: string | null;
}): Record<string, string> {
  const s = input.settings;
  const c = input.client;
  return {
    title: input.title,
    date: formatInvoiceDate(input.today),
    "client.name": c?.name ?? "",
    "client.address": c ? [c.address, c.city, c.pin].filter(Boolean).join(", ") : "",
    "client.gstin_line": c?.gstin ? `, GSTIN ${c.gstin}` : "",
    "project.name": input.project?.name ?? "",
    "studio.name": s.business_name,
    "studio.legal_name": s.legal_name || s.business_name,
    "studio.address": s.address.replace(/\s*\n\s*/g, ", "),
    "studio.gstin": s.gstin,
    "studio.city": studioCity(s),
    fee: input.fee ? formatMoney(input.fee) : "",
    gst_rate: String(input.gstRate),
    valid_until: input.validUntil ? formatInvoiceDate(input.validUntil) : "",
    start_date: input.startsOn ? formatInvoiceDate(input.startsOn) : "",
    end_date: input.endsOn ? formatInvoiceDate(input.endsOn) : "",
  };
}
