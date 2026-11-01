import Link from "next/link";
import { Kpi } from "@/components/charts/Charts";
import { Card } from "@/components/ui";
import { OPEN_STAGES, SOURCE_LABEL, SOURCES, STAGE_LABEL, pipeline } from "@/lib/crm";
import { listLeads } from "@/lib/crm-data";
import { requireMember } from "@/lib/data";
import { compactInr } from "@/lib/format";
import { formatInvoiceDate, todayIso } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { teamDirectory } from "@/lib/pm-data";
import { LeadBoard } from "./LeadBoard";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string; source?: string; owner?: string; q?: string }> }) {
  const { canEdit, isAdmin } = await requireMember();
  const sp = await searchParams;
  const [all, people] = await Promise.all([listLeads(), teamDirectory()]);
  const today = todayIso();
  const q = (sp.q ?? "").toLowerCase();
  const leads = all.filter(
    (l) =>
      (!sp.source || l.source === sp.source) && (!sp.owner || l.owner_email === sp.owner) && (!q || `${l.name} ${l.company} ${l.email} ${l.service}`.toLowerCase().includes(q)),
  );
  const p = pipeline(leads);
  const due = leads.filter((l) => OPEN_STAGES.includes(l.stage) && l.follow_up_on && l.follow_up_on <= today);
  const view = sp.view === "list" ? "list" : "board";
  const keep = new URLSearchParams(Object.entries({ source: sp.source, owner: sp.owner, q: sp.q }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-neutral-500">Enquiries to won work. Drag a card to move it; drop on Won to make the client and project.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link href="/crm/settings" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm">
              Enquiry form &amp; booking
            </Link>
          )}
          {canEdit && (
            <Link href="/crm/new" className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
              Add lead
            </Link>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open leads" value={String(p.open)} />
        <Kpi label="Pipeline value" value={compactInr(p.openValue)} sub="open deals at full value" />
        <Kpi label="Likely value" value={compactInr(p.weighted)} sub="weighted by stage (10–75%)" />
        <Kpi label="Follow-ups due" value={String(due.length)} sub={due.length ? "today or overdue" : "all caught up"} />
      </section>

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="view" value={view} />
        <select name="source" defaultValue={sp.source ?? ""} aria-label="Source" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""} aria-label="Owner" className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5">
          <option value="">Everyone</option>
          {people
            .filter((x) => x.role === "admin" || x.role === "member")
            .map((x) => (
              <option key={x.email} value={x.email}>
                {x.name || x.email}
              </option>
            ))}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Search leads  /" className="w-48 rounded-lg border border-neutral-300 px-2 py-1.5" />
        <button className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white">Filter</button>
        <div className="ml-auto flex rounded-lg bg-white p-0.5 ring-1 ring-black/10" role="group" aria-label="View">
          {(["board", "list"] as const).map((v) => (
            <Link
              key={v}
              href={`/crm?view=${v}${keep ? `&${keep}` : ""}`}
              aria-current={view === v ? "true" : undefined}
              className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-navy text-white" : "text-neutral-700"}`}
            >
              {v}
            </Link>
          ))}
        </div>
      </form>

      {view === "board" ? (
        <LeadBoard leads={leads} today={today} canEdit={canEdit} />
      ) : (
        <Card>
          {leads.length ? (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-2 font-medium">Lead</th>
                    <th className="font-medium">Stage</th>
                    <th className="font-medium">Source</th>
                    <th className="font-medium">Owner</th>
                    <th className="font-medium">Follow up</th>
                    <th className="text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">
                        <Link href={`/crm/${l.id}`} className="font-medium hover:text-navy">
                          {l.company || l.name}
                        </Link>
                        <span className="block text-xs text-neutral-500">{[l.company ? l.name : "", l.service].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td>{STAGE_LABEL[l.stage]}</td>
                      <td className="text-neutral-600">{SOURCE_LABEL[l.source]}</td>
                      <td className="text-neutral-600">{l.owner_email ? displayName(l.owner_email, people) : "—"}</td>
                      <td className={l.follow_up_on && l.follow_up_on <= today && OPEN_STAGES.includes(l.stage) ? "font-medium text-red-700" : "text-neutral-600"}>
                        {l.follow_up_on ? formatInvoiceDate(l.follow_up_on).replace(/, \d{4}$/, "") : ""}
                      </td>
                      <td className="text-right tabular-nums">{l.value ? compactInr(l.value) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-neutral-500">No leads yet. Add one, or share your enquiry form.</p>
          )}
        </Card>
      )}
    </div>
  );
}
