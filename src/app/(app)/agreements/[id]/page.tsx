import Link from "next/link";
import { notFound } from "next/navigation";
import { AgreementBody, PriceTable, SignatureBlocks } from "@/components/agreements/AgreementView";
import { Badge, ButtonLink, PageHeader, Section } from "@/components/ui";
import { getAgreement } from "@/lib/agreement-data";
import { KIND_LABEL, MERGE_FIELDS, STATUS_LABEL, priceTotals } from "@/lib/agreements";
import { listClients, listProjects, requireMember } from "@/lib/data";
import { formatDateTime, formatMoney, formatShortDate } from "@/lib/money";
import { STATUS_TONE } from "../AgreementTabs";
import { AgreementEditor } from "./AgreementEditor";
import { SentActions, SignerActions } from "./SentActions";

export const maxDuration = 60;

const ACTION: Record<string, string> = {
  created: "created it",
  sent: "sent it for signature",
  viewed: "opened the link",
  code_sent: "asked for a code",
  code_wrong: "entered a wrong code",
  code_verified: "verified their email",
  signed: "signed",
  reminded: "sent a reminder",
  declined: "declined",
  voided: "voided it",
  completed: "everyone has signed",
  sealed: "signed PDF sealed",
  seal_failed: "sealing the PDF failed",
};

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { canEdit } = await requireMember();
  const { id } = await params;
  const data = await getAgreement(id);
  if (!data) notFound();
  const { agreement: a, client, project, lead, signers, events } = data;

  const header = (
    <PageHeader
      back={{ href: "/agreements", label: "Agreements" }}
      title={a.title}
      subtitle={
        <>
          {KIND_LABEL[a.kind]} {a.number}
          {client ? " · " : ""}
          {client && a.client_id && (
            <Link href={`/clients/${a.client_id}`} className="hover:text-navy">
              {client.name}
            </Link>
          )}
          {project && a.project_id && (
            <>
              {" · "}
              <Link href={`/projects/${a.project_id}`} className="hover:text-navy">
                {project.code} {project.name}
              </Link>
            </>
          )}
          {lead && a.lead_id && (
            <>
              {" · lead "}
              <Link href={`/crm/${a.lead_id}`} className="hover:text-navy">
                {lead.company || lead.name}
              </Link>
            </>
          )}
        </>
      }
      meta={<Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>}
    />
  );

  if (a.status === "draft" && canEdit) {
    const [clients, projects] = await Promise.all([listClients(), listProjects()]);
    return (
      <div>
        {header}
        <AgreementEditor
          agreement={a}
          signers={signers.map((s) => ({ party: s.party, name: s.name, email: s.email }))}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, client_id: p.client_id }))}
          fields={MERGE_FIELDS}
        />
      </div>
    );
  }

  const totals = a.items.length ? priceTotals(a.items, a.gst_rate) : null;
  return (
    <div>
      {header}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 rounded-xl border border-line bg-white p-6 sm:p-10">
          <AgreementBody body={a.body} />
          {a.items.length > 0 && (
            <div className="mt-6">
              <PriceTable items={a.items} gstRate={a.gst_rate} currency={a.currency} showUnchosen={a.status !== "signed"} />
            </div>
          )}
          <SignatureBlocks signers={signers} />
        </article>

        <aside className="space-y-8">
          {canEdit && (
            <SentActions
              id={a.id}
              status={a.status}
              kind={a.kind}
              hasPdf={!!a.signed_pdf_path}
              allSigned={signers.length > 0 && signers.every((s) => s.signed_at)}
              canQuote={a.kind === "proposal" && a.status === "signed" && !!totals && !a.quote_id}
            />
          )}
          {!canEdit && a.signed_pdf_path && (
            <ButtonLink href={`/api/agreements/${a.id}/pdf`} prefetch={false} size="sm">
              Download signed PDF
            </ButtonLink>
          )}
          <Section title="Signers">
            <ul className="space-y-3 text-sm">
              {signers.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    {s.signed_at ? (
                      <Badge tone="ok">Signed</Badge>
                    ) : s.declined_at ? (
                      <Badge tone="danger">Declined</Badge>
                    ) : s.viewed_at ? (
                      <Badge tone="warn">Opened</Badge>
                    ) : (
                      <Badge>Not opened</Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-neutral-500">{s.email}</div>
                  {s.signed_at && <div className="text-xs text-neutral-500">Signed {formatDateTime(s.signed_at)}</div>}
                  {s.declined_at && s.decline_reason && <div className="text-xs text-danger">“{s.decline_reason}”</div>}
                  {canEdit && a.status === "sent" && !s.signed_at && !s.declined_at && <SignerActions signerId={s.id} />}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {totals && (
                <>
                  <dt className="text-neutral-500">{a.status === "signed" ? "Accepted" : "Up to"}</dt>
                  <dd className="text-right tabular-nums">{formatMoney(totals.total, a.currency)}</dd>
                </>
              )}
              {a.sent_at && (
                <>
                  <dt className="text-neutral-500">Sent</dt>
                  <dd className="text-right">{formatShortDate(a.sent_at.slice(0, 10))}</dd>
                </>
              )}
              {a.expires_on && a.status === "sent" && (
                <>
                  <dt className="text-neutral-500">Link open until</dt>
                  <dd className="text-right">{formatShortDate(a.expires_on)}</dd>
                </>
              )}
              {a.ends_on && (
                <>
                  <dt className="text-neutral-500">Ends</dt>
                  <dd className="text-right">
                    {formatShortDate(a.ends_on)} <span className="text-xs text-neutral-500">(reminder {a.renewal_notice_days}d before)</span>
                  </dd>
                </>
              )}
              {a.quote_id && (
                <>
                  <dt className="text-neutral-500">Quote</dt>
                  <dd className="text-right">
                    <Link href={`/documents/${a.quote_id}`} className="text-navy hover:underline">
                      Open
                    </Link>
                  </dd>
                </>
              )}
            </dl>
            {a.final_hash && (
              <p className="mt-3 text-xs text-neutral-500">
                Fingerprint (SHA-256): <span className="font-mono break-all">{a.final_hash}</span>
              </p>
            )}
          </Section>
          <Section title="History">
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.actor === "system" ? "System" : e.actor.replace(/ <.*>$/, "")}</span> {ACTION[e.action] ?? e.action}
                  {e.action === "voided" && e.detail.reason ? `: ${String(e.detail.reason)}` : ""}
                  <div className="text-xs text-neutral-500">
                    {formatDateTime(e.at)}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </div>
  );
}
