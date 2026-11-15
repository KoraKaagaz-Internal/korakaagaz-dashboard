import { notFound } from "next/navigation";
import { PrintButton } from "@/app/(app)/calendar/[id]/PrintButton";
import { Card, PageHeader } from "@/components/ui";
import { getSettings, requireMember } from "@/lib/data";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { listPaymentLines } from "@/lib/payment-data";
import { modeLabel } from "@/lib/payments";
import { PaymentActions } from "./PaymentActions";

export const metadata = { title: "Payment" };

/** One payment: details, a printable receipt for the client, open the attached invoice, remove it. */
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember("admin");
  const { id } = await params;
  const [lines, settings] = await Promise.all([listPaymentLines(), getSettings()]);
  const p = lines.find((l) => l.id === id);
  if (!p) notFound();
  const rows: [string, React.ReactNode][] = [
    ["Received on", formatInvoiceDate(p.paid_on)],
    ["From", p.client || "—"],
    ["For", [p.project && `${p.project.code} · ${p.project.name}`, p.invoice && `Invoice ${p.invoice.number}`].filter(Boolean).join(" · ") || "—"],
    ["Method", modeLabel(p.mode)],
    ["Reference", p.reference || "—"],
    ...(p.tds ? ([["TDS deducted by client", formatMoney(p.tds)]] as [string, string][]) : []),
    ...(p.note ? ([["Note", p.note]] as [string, string][]) : []),
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/payments?tab=history", label: "Payments" }}
          title={formatMoney(p.amount)}
          subtitle={`${p.client || "Payment"} · ${formatInvoiceDate(p.paid_on)}`}
          actions={
            <>
              <PrintButton />
              <PaymentActions id={p.id} projectId={p.project?.id ?? null} invoiceId={p.invoice?.id ?? null} fileName={p.file_name} />
            </>
          }
        />
      </div>
      <Card>
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{settings.business_name}</div>
              <div className="text-xs whitespace-pre-line text-neutral-500">{settings.address}</div>
              {settings.gstin && <div className="text-xs text-neutral-500">GSTIN {settings.gstin}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs tracking-wide text-neutral-500 uppercase">Payment receipt</div>
              <div className="font-mono text-xs text-neutral-500">#{p.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
          <div className="rounded-lg bg-subtle px-4 py-3">
            <div className="text-xs text-neutral-500">Amount received</div>
            <div className="text-2xl font-semibold tabular-nums">{formatMoney(p.amount)}</div>
          </div>
          <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-500">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-neutral-500">
            This acknowledges money received. It isn&apos;t a GST tax invoice.{settings.query_email ? ` Questions: ${settings.query_email}` : ""}
          </p>
        </div>
      </Card>
    </div>
  );
}
