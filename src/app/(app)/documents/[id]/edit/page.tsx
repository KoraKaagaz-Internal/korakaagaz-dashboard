import { notFound, redirect } from "next/navigation";
import { getDocument, requireMember } from "@/lib/data";
import { DocumentEditor } from "../../DocumentEditor";
import { editorData } from "../../editor-data";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember("member");
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  // Issued documents are locked (GST): view them instead.
  if (doc.status !== "draft" && doc.status !== "awaiting_approval") redirect(`/documents/${id}`);
  const data = await editorData(doc.doc_type, doc.issue_date, doc.bank_account_id);
  return (
    <DocumentEditor
      id={id}
      initial={doc}
      clients={data.clients}
      items={data.items}
      projects={data.projects}
      banks={data.banks}
      supplier={data.supplier}
      defaultSac={data.settings.default_sac}
      numberPreview={data.numberPreview}
    />
  );
}
