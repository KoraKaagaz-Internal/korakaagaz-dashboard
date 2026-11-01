import { notFound } from "next/navigation";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { SAMPLE_DOC, SAMPLE_GST_DOC, SAMPLE_GST_SUPPLIER, SAMPLE_SUPPLIER } from "@/lib/sample";
import type { DocType, DocumentDraft } from "@/lib/types";

// Dev-only previews, used by scripts/visual-diff.mjs.
// ?items=15 repeats the line item; ?full=1 shows every GST field; ?type=quote|proforma|receipt|credit_note;
// ?export=1 renders an export (LUT) invoice in USD; ?overlay=1 shows the reference on top.
export default async function SamplePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const full = !!params.full || !!params.type || !!params.export;
  const base = full ? SAMPLE_GST_DOC : SAMPLE_DOC;
  const count = Math.max(1, Number(params.items) || 1);
  let doc: DocumentDraft = { ...base, items: Array.from({ length: count }, () => base.items[0]) };
  if (params.type) doc = { ...doc, doc_type: params.type as DocType, number: null, valid_until: "2026-10-26" };
  if (params.export) {
    doc = {
      ...doc,
      client: { ...doc.client, address: "221B Baker Street", city: "London", pin: "NW1 6XE", state_code: "", country: "United Kingdom", gstin: "" },
      place_of_supply: "96",
      export_type: "lut",
      gst_mode: "none",
      currency: "USD",
      fx_rate: 83.25,
      items: doc.items.map((i) => ({ ...i, unit_price: 1800 })),
    };
  }
  // ?name=…&addr=… to try long client names and addresses
  if (params.name || params.addr)
    doc = {
      ...doc,
      client: {
        ...doc.client,
        name: params.name ?? doc.client.name,
        address: params.addr ?? doc.client.address,
        city: params.city ?? doc.client.city,
        pin: params.pin ?? doc.client.pin,
        state_code: params.state ?? doc.client.state_code,
      },
    };
  const supplier = full ? { ...SAMPLE_GST_SUPPLIER, lut_number: params.export ? "AD2104260012345" : "" } : SAMPLE_SUPPLIER;

  return (
    <div style={{ position: "relative", width: 852, margin: 0 }}>
      <DocumentTemplate doc={doc} supplier={supplier} status={params.draft ? "draft" : "issued"} />
      {params.overlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/dev-reference.png" alt="" style={{ position: "absolute", left: -1, top: -2, width: 854, opacity: 0.5, pointerEvents: "none" }} />
      )}
    </div>
  );
}
