import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayIso } from "./money";
import type { DocType } from "./types";

export type CopyRelation = "converted_from" | "credit_for" | "revision_of" | "duplicated_from" | "recurring_from";

const OMIT = new Set(["id", "status", "number", "fy", "share_token", "share_enabled", "first_viewed_at", "last_viewed_at", "view_count",
  "issued_at", "sent_at", "accepted_at", "pdf_path", "created_by", "created_at", "updated_at", "document_items", "lost_reason"]);

/**
 * Copies a document and its items into a new draft. Used for conversions, credit notes,
 * duplicates, quote revisions and recurring retainers (cron, with the service-role client).
 */
export async function copyDocumentToDraft(
  supabase: SupabaseClient,
  sourceId: string,
  opts: { doc_type?: DocType; relation: CopyRelation; issue_date?: string; dueDays: number; terms: Partial<Record<DocType, string>> },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data: src } = await supabase.from("documents").select("*, document_items(*)").eq("id", sourceId).single();
  if (!src) return { ok: false, message: "Document not found" };
  const docType = (opts.doc_type ?? src.doc_type) as DocType;
  const issueDate = opts.issue_date ?? todayIso();

  const base = Object.fromEntries(Object.entries(src).filter(([k]) => !OMIT.has(k)));
  const row = {
    ...base,
    doc_type: docType,
    status: "draft",
    issue_date: issueDate,
    due_date: docType === "invoice" ? addDays(issueDate, opts.dueDays) : null,
    valid_until: docType === "quote" ? addDays(issueDate, 15) : null,
    source_id: sourceId,
    source_relation: opts.relation,
    terms: docType !== src.doc_type ? (opts.terms[docType] ?? "") : src.terms,
    recurring: opts.relation === "revision_of" ? src.recurring : null,
  };
  const { data, error } = await supabase.from("documents").insert(row).select("id").single();
  if (error) return { ok: false, message: error.message };

  const items = ((src.document_items as Record<string, unknown>[]) ?? [])
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(({ id: _i, document_id: _d, ...rest }) => {
      void _i;
      void _d;
      return { ...rest, document_id: data.id };
    });
  if (items.length) {
    const { error: itemsErr } = await supabase.from("document_items").insert(items);
    if (itemsErr) return { ok: false, message: itemsErr.message };
  }
  return { ok: true, id: data.id as string };
}
