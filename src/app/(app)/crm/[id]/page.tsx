import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, button } from "@/components/ui";
import { SOURCE_LABEL, STAGE_LABEL } from "@/lib/crm";
import { getLead } from "@/lib/crm-data";
import { getSettings, listDocuments, requireMember } from "@/lib/data";
import { compactInr } from "@/lib/format";
import { formatInvoiceDate, todayIso } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { listTemplates, teamDirectory } from "@/lib/pm-data";
import { DOC_LABELS } from "@/lib/types";
import { EditToggle } from "./EditToggle";
import { Convert, DeleteLead, LogActivity, QuoteLink, StagePicker } from "./LeadPanel";
import { AgreementList } from "@/components/agreements/AgreementList";

const KIND_ICON: Record<string, string> = { note: "✎", call: "☎", whatsapp: "💬", email: "✉", meeting: "◷", stage: "→", system: "•" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ convert?: string }> }) {
  const { canEdit, isAdmin, email } = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const found = await getLead(id);
  if (!found) notFound();
  const { lead: l, activities, client, project } = found;
  const [people, templates, settings, quotes] = await Promise.all([
    teamDirectory(),
    listTemplates(),
    getSettings(),
    client ? listDocuments({ client: client.id, type: "quote" }) : Promise.resolve([]),
  ]);
  const today = todayIso();
  const digits = l.phone.replace(/\D/g, "");
  const wa = digits
    ? `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(`Hi ${l.name.split(" ")[0]}, this is ${settings.business_name} following up on your enquiry.`)}`
    : "";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        back={{ href: "/crm", label: "Leads" }}
        title={l.company || l.name}
        subtitle={
          <>{[l.company ? l.name : "", l.service, `from ${SOURCE_LABEL[l.source]}`, `added ${formatInvoiceDate(l.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")}</>
        }
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              {l.email && (
                <a href={`mailto:${l.email}`} className={button("secondary", "sm")}>
                  Email
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={button("secondary", "sm")}>
                  WhatsApp
                </a>
              )}
              {digits && (
                <a href={`tel:${l.phone}`} className={button("secondary", "sm")}>
                  Call
                </a>
              )}
            </div>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? <StagePicker key={l.stage} lead={l} /> : <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{STAGE_LABEL[l.stage]}</span>}
        {l.stage === "lost" && l.lost_reason && <span className="text-sm text-neutral-600">Lost: {l.lost_reason}</span>}
      </div>

      {canEdit && <Convert lead={l} templates={templates.map((t) => ({ id: t.id, name: t.name }))} open={!!sp.convert} />}

      {(client || project) && (
        <Card title="Won">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {client && (
              <Link href={`/clients/${client.id}`} className="text-navy hover:underline">
                Client: {client.name}
              </Link>
            )}
            {project && (
              <Link href={`/projects/${project.id}`} className="text-navy hover:underline">
                Project: {project.code} · {project.name}
              </Link>
            )}
            {client && canEdit && <QuoteLink clientId={client.id} projectId={project?.id ?? null} />}
          </div>
          {quotes.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/documents/${q.id}`} className="hover:text-navy">
                    {DOC_LABELS.quote.short} {q.number ?? "draft"} · {compactInr(q.taxable)} · {q.status}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <AgreementList title="Proposals and contracts" filter={{ lead: l.id }} newHref={`/agreements/new?lead=${l.id}&kind=proposal`} canEdit={canEdit} />

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {canEdit && (
            <Card title="Log what happened">
              <LogActivity leadId={l.id} followUp={l.follow_up_on} today={today} />
            </Card>
          )}
          <Card title="History">
            {activities.length ? (
              <ol className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="w-5 text-center text-neutral-400" aria-hidden="true">
                      {KIND_ICON[a.kind] ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-neutral-800">{a.body}</p>
                      <p className="text-xs text-neutral-500">
                        <span className="capitalize">{a.kind === "stage" ? "Stage" : a.kind}</span> ·{" "}
                        {a.author_email.includes("@") ? displayName(a.author_email, people) : a.author_email} ·{" "}
                        {new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-neutral-500">Nothing yet.</p>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
              <dt className="text-neutral-500">Email</dt>
              <dd className="truncate">{l.email || "—"}</dd>
              <dt className="text-neutral-500">Phone</dt>
              <dd>{l.phone || "—"}</dd>
              <dt className="text-neutral-500">City</dt>
              <dd>{l.city || "—"}</dd>
              <dt className="text-neutral-500">Budget</dt>
              <dd>{l.budget || "—"}</dd>
              <dt className="text-neutral-500">Value</dt>
              <dd>{l.value ? compactInr(l.value) : "—"}</dd>
              <dt className="text-neutral-500">Owner</dt>
              <dd>{l.owner_email ? displayName(l.owner_email, people) : "—"}</dd>
              <dt className="text-neutral-500">Follow up</dt>
              <dd className={l.follow_up_on && l.follow_up_on <= today ? "font-medium text-danger" : ""}>{l.follow_up_on ? formatInvoiceDate(l.follow_up_on) : "—"}</dd>
            </dl>
            {l.message && <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm whitespace-pre-wrap text-neutral-700">{l.message}</p>}
            {l.notes && <p className="mt-2 text-sm whitespace-pre-wrap text-neutral-600">{l.notes}</p>}
          </Card>
          {canEdit && <EditToggle lead={l} people={people} services={settings.enquiry_services} me={email} />}
          {isAdmin && <DeleteLead id={l.id} />}
        </div>
      </div>
    </div>
  );
}
