import { notFound } from "next/navigation";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { loadShared } from "@/lib/shared";

export const metadata = { robots: { index: false, follow: false } };

// Bare page for the public PDF (does not count as a view).
export default async function SharedPrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadShared(token, false);
  if (!shared) notFound();
  return (
    <>
      <style>{`@page { size: 852px 1278px; margin: 0 } html, body { margin: 0; background: #fff }`}</style>
      <DocumentTemplate doc={shared.doc} supplier={shared.doc.supplier} status={shared.doc.status} reference={shared.reference} />
    </>
  );
}
