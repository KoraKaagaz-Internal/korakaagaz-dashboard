import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { ScaledPreview } from "@/components/invoice/ScaledPreview";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { loadShared } from "@/lib/shared";
import { upiUri } from "@/lib/upi";
import { DOC_LABELS } from "@/lib/types";
import { QuoteResponse } from "./QuoteResponse";

export const metadata: Metadata = { title: "Document · Kora Kaagaz", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadShared(token, true);
  if (!shared) notFound();
  const { doc } = shared;
  const label = DOC_LABELS[doc.doc_type];
  const business = doc.supplier.business_name || "Kora Kaagaz";
  const balance = doc.balance;
  const payable = ["invoice", "proforma"].includes(doc.doc_type) && doc.status === "issued" && (balance?.balance ?? doc.total) > 0.005;
  const due = balance?.balance ?? doc.total;
  const upi = doc.supplier.bank?.upi_id && doc.currency === "INR" && payable
    ? upiUri({ vpa: doc.supplier.bank.upi_id, name: business, amount: due, note: doc.number ?? undefined })
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-serif text-2xl leading-none text-navy uppercase">{business}</div>
          <h1 className="mt-3 text-xl font-semibold">
            {label.title} {doc.number}
          </h1>
          <p className="text-sm text-neutral-600">
            For {doc.client.name} · {formatInvoiceDate(doc.issue_date)}
            {doc.due_date && doc.doc_type === "invoice" ? ` · due ${formatInvoiceDate(doc.due_date)}` : ""}
            {doc.valid_until && doc.doc_type === "quote" ? ` · valid until ${formatInvoiceDate(doc.valid_until)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/share/${token}/pdf`} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium">
            Download PDF
          </a>
          {upi && (
            <a href={upi} className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white sm:hidden">
              Pay {formatMoney(due, doc.currency)} with UPI
            </a>
          )}
        </div>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Info label="Total" value={formatMoney(doc.total, doc.currency)} />
        {balance?.payment_status && (
          <Info
            label="Status"
            value={doc.status === "cancelled" ? "Cancelled" : balance.payment_status === "paid" ? "Paid, thank you" : balance.payment_status === "partial" ? "Partly paid" : balance.overdue ? "Overdue" : "Awaiting payment"}
          />
        )}
        {payable && <Info label="Balance due" value={formatMoney(due, doc.currency)} strong />}
        {doc.doc_type === "quote" && (
          <Info label="Status" value={{ issued: "Awaiting your response", accepted: "Accepted", declined: "Declined", expired: "Expired" }[doc.status as string] ?? doc.status} />
        )}
      </div>

      {doc.doc_type === "quote" && doc.status === "issued" && <QuoteResponse token={token} />}
      {upi && (
        <p className="mb-5 hidden text-sm text-neutral-600 sm:block">
          To pay by UPI, scan the QR code on the {label.short.toLowerCase()} with any UPI app (GPay, PhonePe, Paytm, BHIM).
        </p>
      )}

      <div className="overflow-hidden rounded-xl bg-white border border-line">
        <ScaledPreview>
          <DocumentTemplate doc={doc} supplier={doc.supplier} status={doc.status} reference={shared.reference} />
        </ScaledPreview>
      </div>
      <p className="mt-6 text-center text-xs text-neutral-500">
        Questions? {doc.supplier.query_email} {doc.supplier.query_phone && `· ${doc.supplier.query_phone}`}
      </p>
    </main>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 border border-line">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${strong ? "text-navy" : ""}`}>{value}</div>
    </div>
  );
}
