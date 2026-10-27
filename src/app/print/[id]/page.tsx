import { notFound } from "next/navigation";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { getDocument } from "@/lib/data";
import { referenceFor } from "@/lib/reference";

// Bare document page rendered by the PDF route (and printable from the browser).
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  return (
    <>
      <style>{`@page { size: 852px 1278px; margin: 0 } html, body { margin: 0; background: #fff }`}</style>
      <DocumentTemplate doc={doc} supplier={doc.supplier} status={doc.status} reference={await referenceFor(doc)} />
    </>
  );
}
