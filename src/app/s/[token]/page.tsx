import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgreementBody, PriceTable, SignatureBlocks } from "@/components/agreements/AgreementView";
import { loadByToken } from "@/lib/agreement-sign";
import { KIND_LABEL } from "@/lib/agreements";
import { formatInvoiceDate, todayIso } from "@/lib/money";
import { markViewed } from "./actions";
import { SignPanel } from "./SignPanel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Review and sign", robots: { index: false, follow: false } };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (!ctx) notFound();
  await markViewed(token);
  const { agreement: a, signer: me, signers, studio } = ctx;
  const expired = a.status === "expired" || (a.status === "sent" && !!a.expires_on && a.expires_on < todayIso());
  const open = a.status === "sent" && !expired && !me.signed_at && !me.declined_at;
  const chooser = a.kind === "proposal" && a.items.some((i) => i.optional) && signers.find((s) => s.party === "client")?.id === me.id && open;

  const banner = me.signed_at
    ? a.status === "signed"
      ? "Signed by everyone. You can download the signed copy below."
      : "You've signed. We'll email the final copy when everyone has signed."
    : a.status === "void"
      ? "The studio has withdrawn this document."
      : a.status === "declined"
        ? "This was declined."
        : expired
          ? "This link has expired. Ask the studio for a new one."
          : null;

  return (
    <main className="min-h-screen bg-subtle px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-serif text-2xl text-navy uppercase">{studio.business_name}</p>
            <p className="text-sm text-neutral-500">
              {KIND_LABEL[a.kind]} {a.number} · for {me.name}
              {a.expires_on && open ? ` · open until ${formatInvoiceDate(a.expires_on)}` : ""}
            </p>
          </div>
          {a.status === "signed" && me.signed_at && (
            <a href={`/s/${token}/pdf`} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium">
              Download signed PDF
            </a>
          )}
        </header>
        {banner && <p className="mb-4 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-line">{banner}</p>}

        <article className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-line sm:p-10">
          <AgreementBody body={a.body} />
          {a.items.length > 0 && !chooser && (
            <div className="mt-6">
              <PriceTable items={a.items} gstRate={a.gst_rate} currency={a.currency} showUnchosen={a.status === "sent"} />
            </div>
          )}
          <SignatureBlocks signers={signers} />
        </article>

        {open && (
          <SignPanel
            token={token}
            name={me.name}
            title={a.title}
            pricing={chooser ? { items: a.items, gstRate: a.gst_rate, currency: a.currency } : null}
            studioEmail={studio.query_email}
          />
        )}
        <p className="mt-8 text-center text-xs text-neutral-400">
          Electronic signature with email verification, under the Information Technology Act, 2000. Every step is logged with time and IP address, and the final PDF carries a
          tamper-evident fingerprint.
        </p>
      </div>
    </main>
  );
}
