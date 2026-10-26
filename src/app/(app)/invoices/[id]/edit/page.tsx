import { notFound } from "next/navigation";
import { getInvoice, listClients } from "@/lib/data";
import { InvoiceEditor } from "../../InvoiceEditor";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, clients] = await Promise.all([getInvoice(id), listClients()]);
  if (!invoice) notFound();
  return <InvoiceEditor id={id} clients={clients} payment={invoice.payment} initial={invoice} status={invoice.status} />;
}
