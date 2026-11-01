import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { ScaledPreview } from "@/components/invoice/ScaledPreview";
import { Card, StatusPill, displayStatus } from "@/components/ui";
import { getDocument, getSettings, listAudit, listDocuments, listEmailLog, listPayments, relatedDocuments, requireMember } from "@/lib/data";
import { DEFAULT_MESSAGES, fillTemplate, messageValues } from "@/lib/messages";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { referenceFor } from "@/lib/reference";
import { DOC_LABELS, type DocType } from "@/lib/types";
import { siteUrl } from "@/app/actions/auth";
import { DocumentActions } from "./DocumentActions";

const ACTION_TEXT: Record<string, string> = {
  insert: "created",
  update: "edited",
  delete: "deleted",
  status_issued: "issued",
  status_awaiting_approval: "sent for approval",
  status_draft: "sent back to draft",
  status_cancelled: "cancelled",
  status_accepted: "marked accepted",
  status_declined: "marked declined",
  status_expired: "expired",
  payment_insert: "recorded a payment",
  payment_delete: "deleted a payment",
  quote_accepted: "accepted the quote",
  quote_declined: "declined the quote",
};

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ flash?: string }> }) {
  const { canEdit, isAdmin } = await requireMember();
  const { id } = await params;
  const { flash } = await searchParams;
  const doc = await getDocument(id);
  if (!doc) notFound();

  const [settings, payments, audit, emails, related, reference, site] = await Promise.all([
    getSettings(),
    listPayments(id),
    listAudit(id),
    listEmailLog(id),
    relatedDocuments(id, doc.source_id),
    referenceFor(doc),
    siteUrl(),
  ]);
  const receipts = doc.doc_type === "invoice" && doc.client_id ? (await listDocuments({ type: "receipt", client: doc.client_id })).filter((r) => r.status === "issued") : [];

  const label = DOC_LABELS[doc.doc_type];
  const shareUrl = `${site}/d/${doc.share_token}`;
  const today = todayIso();
  const values = messageValues(doc, settings.business_name, shareUrl, today);
  const tpl = (k: keyof typeof DEFAULT_MESSAGES) => fillTemplate(settings.message_templates[k] || DEFAULT_MESSAGES[k], values);
  const phone = doc.client.phone.replace(/[^\d]/g, "");
  const waNumber = phone.length === 10 ? `91${phone}` : phone;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/documents?type=${doc.doc_type}`} className="text-sm text-neutral-500 hover:text-navy">
            ← {label.plural}
          </Link>
          <h1 className="text-2xl font-semibold">
            {label.short} {doc.number ?? "(draft)"}
          </h1>
          <StatusPill status={displayStatus(doc)} />
        </div>
        {flash && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-green-200">{flash}</p>}
        <ScaledPreview>
          <DocumentTemplate doc={doc} supplier={doc.supplier} status={doc.status} reference={reference} />
        </ScaledPreview>
      </div>

      <div className="space-y-4">
        <Card>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-neutral-500">Client</dt>
            <dd className="text-right">
              {doc.client_id ? (
                <Link className="hover:text-navy" href={`/clients/${doc.client_id}`}>
                  {doc.client.name}
                </Link>
              ) : (
                doc.client.name
              )}
            </dd>
            <dt className="text-neutral-500">Total</dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(doc.total, doc.currency)}</dd>
            {doc.balance?.payment_status && (
              <>
                <dt className="text-neutral-500">Received</dt>
                <dd className="text-right tabular-nums">{formatMoney(doc.balance.paid, doc.currency)}</dd>
                {doc.balance.tds > 0 && (
                  <>
                    <dt className="text-neutral-500">TDS deducted</dt>
                    <dd className="text-right tabular-nums">{formatMoney(doc.balance.tds, doc.currency)}</dd>
                  </>
                )}
                {doc.balance.credited > 0 && (
                  <>
                    <dt className="text-neutral-500">Credit notes</dt>
                    <dd className="text-right tabular-nums">{formatMoney(doc.balance.credited, doc.currency)}</dd>
                  </>
                )}
                <dt className="font-medium text-navy">Balance due</dt>
                <dd className="text-right font-semibold text-navy tabular-nums">{formatMoney(doc.balance.balance, doc.currency)}</dd>
              </>
            )}
            {doc.sent_at && (
              <>
                <dt className="text-neutral-500">Sent</dt>
                <dd className="text-right">{formatInvoiceDate(doc.sent_at)}</dd>
              </>
            )}
            {doc.status !== "draft" && (
              <>
                <dt className="text-neutral-500">Client views</dt>
                <dd className="text-right">{doc.view_count ? `${doc.view_count} · last ${formatInvoiceDate(doc.last_viewed_at)}` : "Not opened yet"}</dd>
              </>
            )}
            {doc.lost_reason && (
              <>
                <dt className="text-neutral-500">Declined because</dt>
                <dd className="text-right">{doc.lost_reason}</dd>
              </>
            )}
          </dl>
        </Card>

        <DocumentActions
          doc={{
            id: doc.id,
            doc_type: doc.doc_type,
            status: doc.status,
            number: doc.number,
            currency: doc.currency,
            balance: doc.balance?.balance ?? 0,
            payment_status: doc.balance?.payment_status ?? null,
            share_enabled: doc.share_enabled,
            reminders_enabled: doc.reminders_enabled,
            recurring: doc.recurring,
            client_email: doc.client.email,
            client_id: doc.client_id,
            taxable_ratio: doc.total > 0 ? doc.taxable / doc.total : 1,
            total: doc.total,
            client_name: doc.client.name,
          }}
          canEdit={canEdit}
          isAdmin={isAdmin}
          shareUrl={shareUrl}
          email={{ subject: tpl("email_subject"), body: tpl("email_body") }}
          whatsapp={`https://wa.me/${waNumber}?text=${encodeURIComponent(tpl("whatsapp"))}`}
          payments={payments}
          receipts={receipts.map((r) => ({ id: r.id, number: r.number ?? "", total: r.total }))}
          today={today}
        />

        {related.length > 0 && (
          <Card title="Linked documents">
            <ul className="space-y-1.5 text-sm">
              {related.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link href={`/documents/${r.id}`} className="hover:text-navy">
                    {DOC_LABELS[r.doc_type as DocType].short} {r.number ?? "(draft)"}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {r.id === doc.source_id ? "source" : (r.source_relation ?? "").replace(/_/g, " ")} · {formatMoney(Number(r.total), r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {emails.length > 0 && (
          <Card title="Emails">
            <ul className="space-y-1.5 text-sm">
              {emails.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {e.kind} → {e.to_email}
                  </span>
                  <span className={`text-xs ${e.status === "sent" ? "text-green-700" : e.status === "failed" ? "text-red-600" : "text-neutral-500"}`} title={e.error}>
                    {e.status} · {formatInvoiceDate(e.sent_at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Activity">
          <ol className="space-y-1.5 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span>
                  <span className="text-neutral-800">{a.actor_email || "system"}</span> {ACTION_TEXT[a.action] ?? a.action.replace(/_/g, " ")}
                  {a.action === "payment_insert" && a.diff?.amount ? ` · ${formatMoney(Number(a.diff.amount), doc.currency)}` : ""}
                </span>
                <time className="shrink-0 text-xs text-neutral-500" title={a.at}>
                  {new Date(a.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
