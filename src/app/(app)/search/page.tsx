import Link from "next/link";
import { EmptyState, PageHeader, Section, inputCls } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { formatMoney, formatShortDate } from "@/lib/money";

export const metadata = { title: "Search" };

/** One search box for projects, clients, leads and documents. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireMember();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  // PostgREST or-filter: strip characters that have meaning there
  const term = q.replace(/[%,()*:"\\]/g, " ").trim();
  const like = `%${term}%`;
  const [projects, clients, leads, docs] = term
    ? await Promise.all([
        supabase.from("projects").select("id, code, name, status").or(`name.ilike.${like},code.ilike.${like}`).limit(8),
        supabase.from("clients").select("id, name, city").ilike("name", like).limit(8),
        supabase.from("leads").select("id, name, company, stage").or(`name.ilike.${like},company.ilike.${like}`).limit(8),
        supabase
          .from("documents")
          .select("id, doc_type, number, status, issue_date, total, currency, client_snapshot")
          .or(`number.ilike.${like},client_snapshot->>name.ilike.${like}`)
          .order("issue_date", { ascending: false })
          .limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  type R = Record<string, unknown>;
  const groups: { title: string; rows: { href: string; title: string; sub: string }[] }[] = [
    {
      title: "Projects",
      rows: ((projects.data ?? []) as R[]).map((p) => ({ href: `/projects/${p.id}`, title: `${p.code} · ${p.name}`, sub: String(p.status).replace(/_/g, " ") })),
    },
    { title: "Clients", rows: ((clients.data ?? []) as R[]).map((c) => ({ href: `/clients/${c.id}`, title: String(c.name), sub: String(c.city ?? "") })) },
    { title: "Leads", rows: ((leads.data ?? []) as R[]).map((l) => ({ href: `/crm/${l.id}`, title: String(l.name), sub: [l.company, l.stage].filter(Boolean).join(" · ") })) },
    {
      title: "Invoices & quotes",
      rows: ((docs.data ?? []) as R[]).map((d) => ({
        href: `/documents/${d.id}`,
        title: `${d.number ?? "Draft"} · ${(d.client_snapshot as { name?: string } | null)?.name ?? ""}`,
        sub: [String(d.doc_type).replace(/_/g, " "), formatShortDate(d.issue_date as string), formatMoney(Number(d.total), d.currency as string)].join(" · "),
      })),
    },
  ].filter((g) => g.rows.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" />
      <form action="/search" role="search" className="mb-6">
        <input name="q" type="search" defaultValue={q} autoFocus aria-label="Search" placeholder="Project, client, lead, invoice number…" className={inputCls} />
      </form>
      {!term ? (
        <p className="text-sm text-neutral-500">Type a name, a project code or an invoice number.</p>
      ) : !groups.length ? (
        <EmptyState title={`Nothing matches “${q}”`} hint="Try part of a name, a project code like KK-12, or an invoice number." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Section key={g.title} title={g.title}>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-navy">
                      <span className="min-w-0 truncate font-medium">{r.title}</span>
                      <span className="shrink-0 text-xs text-neutral-500 capitalize">{r.sub}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
