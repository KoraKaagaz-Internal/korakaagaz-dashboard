import Link from "next/link";
import { DataList, EmptyState, FilterBar, Input, PageHeader, Segmented, Select, Stat, button } from "@/components/ui";
import { OPEN_STAGES, SOURCE_LABEL, SOURCES, STAGE_LABEL, pipeline } from "@/lib/crm";
import { listLeads } from "@/lib/crm-data";
import { requireMember } from "@/lib/data";
import { compactInr } from "@/lib/format";
import { formatShortDate, todayIso } from "@/lib/money";
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
      <PageHeader
        title="Leads"
        subtitle="Enquiries to won work. Drag a card to move it; drop on Won to make the client and project."
        actions={
          <>
            <div className="flex gap-2">
              {isAdmin && (
                <Link href="/crm/settings" className={button("secondary", "sm")}>
                  Enquiry form &amp; booking
                </Link>
              )}
              {canEdit && (
                <Link href="/crm/new" className={button("primary", "sm")}>
                  Add lead
                </Link>
              )}
            </div>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 lg:grid-cols-4">
        <Stat label="Open leads" value={String(p.open)} />
        <Stat label="Pipeline value" value={compactInr(p.openValue)} sub="open deals at full value" />
        <Stat
          label="Likely value"
          value={compactInr(p.weighted)}
          info="Each open deal's value × the chance of winning at its stage: Enquiry 10%, Discovery 25%, Proposal 50%, Negotiation 75%."
        />
        <Stat label="Follow-ups due" value={String(due.length)} sub={due.length ? "today or overdue" : "all caught up"} tone={due.length ? "warn" : undefined} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar
          action="/crm"
          active={(sp.source ? 1 : 0) + (sp.owner ? 1 : 0)}
          clearHref={`/crm?view=${view}`}
          search={
            <>
              <input type="hidden" name="view" value={view} />
              <Input name="q" type="search" defaultValue={sp.q} aria-label="Search leads" placeholder="Search leads" className="!h-8 !py-1" />
            </>
          }
        >
          <Select name="source" defaultValue={sp.source ?? ""} aria-label="Source" className="!h-8 !w-auto !py-1">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select name="owner" defaultValue={sp.owner ?? ""} aria-label="Owner" className="!h-8 !w-auto !py-1">
            <option value="">Everyone</option>
            {people
              .filter((x) => x.role === "admin" || x.role === "member")
              .map((x) => (
                <option key={x.email} value={x.email}>
                  {x.name || x.email}
                </option>
              ))}
          </Select>
        </FilterBar>
        <Segmented
          label="View"
          items={(["board", "list"] as const).map((v) => ({ href: `/crm?view=${v}${keep ? `&${keep}` : ""}`, label: v === "board" ? "Board" : "List", active: view === v }))}
        />
      </div>

      {view === "board" ? (
        <LeadBoard leads={leads} today={today} canEdit={canEdit} />
      ) : leads.length ? (
        <DataList
          label="Leads"
          columns={[
            { key: "lead", label: "Lead", primary: true },
            { key: "stage", label: "Stage" },
            { key: "source", label: "Source", hideOnMobile: true },
            { key: "owner", label: "Owner", hideOnMobile: true },
            { key: "follow", label: "Follow up" },
            { key: "value", label: "Value", align: "right" },
          ]}
          rows={leads.map((l) => ({
            id: l.id,
            href: `/crm/${l.id}`,
            cells: {
              lead: (
                <span className="block">
                  {l.company || l.name}
                  <span className="block text-xs font-normal text-neutral-500">{[l.company ? l.name : "", l.service].filter(Boolean).join(" · ")}</span>
                </span>
              ),
              stage: STAGE_LABEL[l.stage],
              source: <span className="text-neutral-600">{SOURCE_LABEL[l.source]}</span>,
              owner: <span className="text-neutral-600">{l.owner_email ? displayName(l.owner_email, people) : "—"}</span>,
              follow: (
                <span className={l.follow_up_on && l.follow_up_on <= today && OPEN_STAGES.includes(l.stage) ? "font-medium text-danger" : "text-neutral-600"}>
                  {l.follow_up_on ? formatShortDate(l.follow_up_on) : ""}
                </span>
              ),
              value: l.value ? compactInr(l.value) : "",
            },
          }))}
        />
      ) : (
        <EmptyState title="No leads yet" hint="Add one, or share your enquiry form so enquiries land here." />
      )}
    </div>
  );
}
