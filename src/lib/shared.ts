import "server-only";
import { toDocument } from "./data";
import { createAnonClient } from "./supabase/server";
import { DOC_LABELS, type DocType, type DocumentRecord } from "./types";

export interface Shared {
  doc: DocumentRecord;
  reference: { label: string; number: string; date: string } | null;
}

/** Loads a document by its share token through the anon-only RPC. */
export async function loadShared(token: string, track: boolean): Promise<Shared | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("shared_document", { p_token: token, p_track: track });
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const doc = toDocument(row, row.balance as Record<string, unknown> | null);
  const src = row.source as { doc_type: DocType; number: string | null; issue_date: string } | null;
  return {
    doc,
    reference:
      src?.number && ["credit_for", "converted_from"].includes(String(row.source_relation))
        ? { label: doc.doc_type === "credit_note" ? "Against" : `From ${DOC_LABELS[src.doc_type].short.toLowerCase()}`, number: src.number, date: src.issue_date }
        : null,
  };
}
