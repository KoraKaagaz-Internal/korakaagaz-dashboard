import "server-only";
import { requireMember } from "./data";
import { DOC_LABELS, type DocType, type DocumentRecord } from "./types";

/** "Against KK/26-27/004" for credit notes; "From quote QT/26-27/002" for conversions. */
export async function referenceFor(doc: DocumentRecord) {
  if (!doc.source_id || !["credit_for", "converted_from"].includes(doc.source_relation ?? "")) return null;
  const { supabase } = await requireMember();
  const { data } = await supabase.from("documents").select("doc_type, number, issue_date").eq("id", doc.source_id).maybeSingle();
  if (!data?.number) return null;
  return {
    label: doc.source_relation === "credit_for" ? "Against" : `From ${DOC_LABELS[data.doc_type as DocType].short.toLowerCase()}`,
    number: String(data.number),
    date: String(data.issue_date),
  };
}
