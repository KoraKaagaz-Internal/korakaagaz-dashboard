import { notFound } from "next/navigation";
import { InvoiceTemplate } from "@/components/invoice/InvoiceTemplate";
import { getInvoice } from "@/lib/data";

// Bare invoice page rendered by the PDF route (and printable from the browser).
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  return (
    <>
      <style>{`@page { size: 852px 1278px; margin: 0 } html, body { margin: 0; background: #fff }`}</style>
      <InvoiceTemplate invoice={invoice} payment={invoice.payment} />
    </>
  );
}
