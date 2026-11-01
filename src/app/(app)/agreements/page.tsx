import { Badge, ButtonLink, DataList, EmptyState, FilterBar, Input, PageHeader, Select } from "@/components/ui";
import { listAgreements } from "@/lib/agreement-data";
import { KINDS, KIND_LABEL, STATUS_LABEL, type AgreementStatus } from "@/lib/agreements";
import { requireMember } from "@/lib/data";
import { daysBetween, formatShortDate, todayIso } from "@/lib/money";
import { AgreementTabs, STATUS_TONE } from "./AgreementTabs";

export const metadata = { title: "Agreements" };

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string; q?: string }> }) {
  const { canEdit } = await requireMember();
  const sp = await searchParams;
  const status = Object.keys(STATUS_LABEL).includes(sp.status ?? "") ? sp.status : undefined;
  const rows = await listAgreements({ status, kind: sp.kind || undefined, q: sp.q });
  const today = todayIso();
  const tab = status ? `/agreements?status=${status}` : "/agreements";
  const filtered = !!(sp.kind || sp.q);

  return (
    <div>
      <PageHeader
        title="Agreements"
        subtitle="Proposals, contracts, NDAs and releases, signed online with an email code."
        actions={
          canEdit && (
            <ButtonLink href="/agreements/new" variant="primary" size="sm">
              New agreement
            </ButtonLink>
          )
        }
        tabs={<AgreementTabs current={tab} />}
      />
      <FilterBar
        action="/agreements"
        active={sp.kind ? 1 : 0}
        clearHref={tab}
        search={
          <>
            {status && <input type="hidden" name="status" value={status} />}
            <Input name="q" type="search" defaultValue={sp.q} aria-label="Search agreements" placeholder="Search title or number" className="!h-8 !py-1" />
          </>
        }
      >
        <Select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type" className="!h-8 !w-auto !py-1">
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches" : status ? `No ${STATUS_LABEL[status as AgreementStatus].toLowerCase()} agreements` : "No agreements yet"}
          filtered={filtered}
          hint={filtered ? undefined : "Start from a template: a proposal with add-ons, a service agreement, an NDA, a freelancer agreement or a model release."}
          action={
            canEdit && !filtered ? (
              <ButtonLink href="/agreements/new" variant="primary" size="sm">
                New agreement
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <DataList
          label="Agreements"
          columns={[
            { key: "title", label: "Agreement", primary: true },
            { key: "kind", label: "Type" },
            { key: "signers", label: "Signatures" },
            { key: "status", label: "Status" },
            { key: "date", label: "Updated", hideOnMobile: true },
          ]}
          rows={rows.map((a) => {
            const signed = a.signers.filter((s) => s.signed_at).length;
            const renewIn = a.status === "signed" && a.ends_on ? daysBetween(today, a.ends_on) : null;
            return {
              id: a.id,
              href: `/agreements/${a.id}`,
              cells: {
                title: (
                  <span className="block">
                    {a.title}
                    <span className="block text-xs font-normal text-neutral-500">
                      {a.number}
                      {a.client_name ? ` · ${a.client_name}` : ""}
                      {a.project_code ? ` · ${a.project_code}` : ""}
                    </span>
                  </span>
                ),
                kind: <span className="text-neutral-600">{KIND_LABEL[a.kind]}</span>,
                signers: (
                  <span className="text-neutral-600 tabular-nums">
                    {signed} of {a.signers.length}
                  </span>
                ),
                status: (
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    {renewIn !== null && renewIn <= a.renewal_notice_days && <Badge tone={renewIn < 0 ? "danger" : "warn"}>{renewIn < 0 ? "ended" : `ends in ${renewIn}d`}</Badge>}
                  </span>
                ),
                date: <span className="text-neutral-500">{formatShortDate((a.completed_at ?? a.sent_at ?? a.created_at).slice(0, 10))}</span>,
              },
            };
          })}
        />
      )}
    </div>
  );
}
