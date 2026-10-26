import { notFound } from "next/navigation";
import { InvoiceTemplate } from "@/components/invoice/InvoiceTemplate";
import { SAMPLE_INVOICE, SAMPLE_PAYMENT } from "@/lib/sample";

// Dev-only: the reference invoice, used by scripts/visual-diff.mjs.
// ?items=15 repeats the line item to test pagination; ?overlay=1 shows the reference on top.
export default async function SamplePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const count = Math.max(1, Number(params.items) || 1);
  const invoice = { ...SAMPLE_INVOICE, items: Array.from({ length: count }, () => SAMPLE_INVOICE.items[0]) };
  if (params.gst) Object.assign(invoice, { gst_mode: params.gst, gst_rate: 18, discount_type: "percent", discount_value: 10 });

  return (
    <div style={{ position: "relative", width: 852, margin: 0 }}>
      <InvoiceTemplate invoice={invoice} payment={SAMPLE_PAYMENT} />
      {params.overlay && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/dev-reference.png"
          alt=""
          style={{ position: "absolute", left: -1, top: -2, width: 854, opacity: 0.5, pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
