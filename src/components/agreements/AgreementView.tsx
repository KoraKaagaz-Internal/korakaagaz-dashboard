import { renderMarkdown, type PriceItem, type Signer } from "@/lib/agreements";
import { formatDateTime, formatMoney } from "@/lib/money";
import { priceTotals } from "@/lib/agreements";

/** The document body (light markdown, escaped). */
export function AgreementBody({ body }: { body: string }) {
  return <div className="ag-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />;
}

/** Proposal pricing, read-only. `showUnchosen` lists add-ons that weren't picked. */
export function PriceTable({ items, gstRate, currency, showUnchosen = true }: { items: PriceItem[]; gstRate: number; currency: string; showUnchosen?: boolean }) {
  if (!items.length) return null;
  const t = priceTotals(items, gstRate);
  const shown = showUnchosen ? items : items.filter((i) => !i.optional || i.selected);
  return (
    <table className="ag-price w-full text-sm">
      <tbody>
        {shown.map((i, n) => (
          <tr key={n} className={i.optional && !i.selected ? "text-neutral-400" : ""}>
            <td className="py-2 pr-3 align-top">
              <span className="font-medium">{i.title}</span>
              {i.optional && <span className="ml-2 text-xs">{i.selected ? "· add-on, chosen" : "· optional add-on"}</span>}
              {i.description && <span className="block text-xs text-neutral-500">{i.description}</span>}
            </td>
            <td className="py-2 text-right align-top tabular-nums whitespace-nowrap">{formatMoney(i.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-line">
        <tr>
          <td className="pt-2 text-neutral-600">Subtotal</td>
          <td className="pt-2 text-right tabular-nums">{formatMoney(t.subtotal, currency)}</td>
        </tr>
        <tr>
          <td className="text-neutral-600">GST {gstRate}%</td>
          <td className="text-right tabular-nums">{formatMoney(t.gst, currency)}</td>
        </tr>
        <tr className="font-semibold">
          <td className="pt-1">Total</td>
          <td className="pt-1 text-right tabular-nums">{formatMoney(t.total, currency)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

const PARTY = { client: "Client", studio: "For the studio", other: "Signer" } as const;

/** One block per signer: typed name in a handwriting face, the drawn mark if any, when and from where. */
export function SignatureBlocks({ signers, images }: { signers: Signer[]; images?: Record<string, string | null> }) {
  return (
    <div className="ag-sigs mt-8 grid gap-6 sm:grid-cols-2">
      {signers.map((s) => (
        <div key={s.id} className="border-t border-ink/40 pt-2 text-sm">
          <div className="text-xs tracking-wide text-neutral-500 uppercase">{PARTY[s.party]}</div>
          {s.signed_at ? (
            <>
              {images?.[s.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[s.id]!} alt={`Signature of ${s.signature_name}`} className="my-1 h-14 w-auto" />
              ) : (
                <div className="my-1 font-serif text-2xl italic">{s.signature_name}</div>
              )}
              <div className="font-medium">{s.signature_name}</div>
              <div className="text-xs text-neutral-500">
                {s.email} · signed {formatDateTime(s.signed_at, { year: true })} IST{s.signed_ip ? ` · IP ${s.signed_ip}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="my-1 h-10" />
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-neutral-500">{s.declined_at ? `declined ${formatDateTime(s.declined_at, { year: true })}` : `${s.email} · not signed yet`}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
