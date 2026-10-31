import "server-only";
import type { Lead } from "./crm";
import { requireMember } from "./data";

type Row = Record<string, unknown>;
const toLead = (r: Row): Lead => ({ ...(r as unknown as Lead), value: Number(r.value ?? 0), sort: Number(r.sort ?? 0) });

export async function listLeads(): Promise<Lead[]> {
  const { supabase } = await requireMember();
  const { data } = await supabase.from("leads").select("*").order("sort").order("created_at", { ascending: false }).limit(2000);
  return ((data ?? []) as Row[]).map(toLead);
}

export interface Activity {
  id: string;
  kind: string;
  body: string;
  author_email: string;
  at: string;
}

export async function getLead(id: string): Promise<{ lead: Lead; activities: Activity[]; client: { id: string; name: string } | null; project: { id: string; code: string; name: string } | null } | null> {
  const { supabase } = await requireMember();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [{ data }, { data: acts }] = await Promise.all([
    supabase.from("leads").select("*, clients(id, name), projects(id, code, name)").eq("id", id).maybeSingle(),
    supabase.from("lead_activities").select("*").eq("lead_id", id).order("at", { ascending: false }),
  ]);
  if (!data) return null;
  return {
    lead: toLead(data as Row),
    activities: (acts ?? []) as Activity[],
    client: (data.clients as { id: string; name: string } | null) ?? null,
    project: (data.projects as { id: string; code: string; name: string } | null) ?? null,
  };
}
