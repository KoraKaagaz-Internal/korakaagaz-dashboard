import { notFound } from "next/navigation";
import { AgreementBody, PriceTable, SignatureBlocks } from "@/components/agreements/AgreementView";
import { SIGNER_COLUMNS, toAgreement } from "@/lib/agreement-data";
import { checkPrintSig } from "@/lib/agreement-sign";
import { KIND_LABEL, type Signer } from "@/lib/agreements";
import { formatDateTime } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const ACTION: Record<string, string> = {
  created: "Created",
  sent: "Sent for signature",
  viewed: "Opened the link",
  code_sent: "Verification code emailed",
  code_wrong: "Wrong code entered",
  code_verified: "Email verified with code",
  signed: "Signed",
  reminded: "Reminder sent",
  declined: "Declined",
  voided: "Voided",
  completed: "All parties signed",
  sealed: "Signed PDF sealed",
};

/** Bare page the PDF renderer prints: the agreement, signatures, then the signing certificate. Needs an HMAC signature in ?sig. */
export default async function AgreementPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sig?: string }> }) {
  const { id } = await params;
  const { sig } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || !sig || !checkPrintSig(id, sig)) notFound();
  const supabase = createAdminClient();
  const [{ data: a }, { data: signers }, { data: images }, { data: events }, { data: settings }] = await Promise.all([
    supabase.from("agreements").select("*").eq("id", id).single(),
    supabase.from("agreement_signers").select(SIGNER_COLUMNS).eq("agreement_id", id).order("position"),
    supabase.from("agreement_signers").select("id, signature_image, signed_user_agent").eq("agreement_id", id),
    supabase.from("agreement_events").select("at, action, actor, ip, hash").eq("agreement_id", id).order("id"),
    supabase.from("settings").select("business_name, legal_name, address, gstin").eq("id", 1).single(),
  ]);
  if (!a) notFound();
  const ag = toAgreement(a);
  const list = (signers ?? []) as Signer[];
  const img = Object.fromEntries((images ?? []).map((i) => [i.id as string, (i.signature_image as string) ?? null]));
  const ua = Object.fromEntries((images ?? []).map((i) => [i.id as string, (i.signed_user_agent as string) ?? ""]));

  return (
    <>
      <style>{`@page { size: 852px 1278px; margin: 64px 72px } html, body { margin: 0; background: #fff } .cert { break-before: page }`}</style>
      <div className="text-ink">
        <header className="mb-8 flex items-end justify-between border-b border-line pb-3 text-xs text-neutral-500">
          <span className="font-serif text-lg text-navy uppercase">{settings?.business_name}</span>
          <span>
            {KIND_LABEL[ag.kind]} {ag.number}
          </span>
        </header>
        <AgreementBody body={ag.body} />
        {ag.items.length > 0 && (
          <div className="mt-6">
            <PriceTable items={ag.items} gstRate={ag.gst_rate} currency={ag.currency} showUnchosen={false} />
          </div>
        )}
        <SignatureBlocks signers={list} images={img} />

        <section className="cert text-[12px]">
          <h1 className="mb-1 font-serif text-2xl text-navy">Signing certificate</h1>
          <p className="mb-4 text-neutral-600">
            {ag.number} · “{ag.title}” · {settings?.legal_name || settings?.business_name}
            {settings?.gstin ? ` · GSTIN ${settings.gstin}` : ""}
          </p>
          <table className="mb-6 w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left text-neutral-500">
                <th className="py-1 pr-2 font-medium">Signer</th>
                <th className="pr-2 font-medium">Verified by</th>
                <th className="pr-2 font-medium">Signed (IST)</th>
                <th className="font-medium">IP and device</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2">
                    {s.signature_name ?? s.name}
                    <div className="text-neutral-500">{s.email}</div>
                  </td>
                  <td className="pr-2">Code emailed to {s.email}</td>
                  <td className="pr-2">{s.signed_at ? formatDateTime(s.signed_at, { year: true }) : "—"}</td>
                  <td className="text-neutral-600">
                    {s.signed_ip ?? "—"}
                    <div className="max-w-56 truncate text-neutral-400">{ua[s.id]}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="mb-1 font-semibold">Signing log</h2>
          <p className="mb-2 text-neutral-500">Each entry is chained to the one before it with SHA-256, so a changed or removed entry breaks the chain.</p>
          <table className="w-full border-collapse">
            <tbody>
              {(events ?? []).map((e, i) => (
                <tr key={i} className="border-b border-line align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{formatDateTime(e.at as string, { year: true })}</td>
                  <td className="pr-2">{ACTION[e.action as string] ?? e.action}</td>
                  <td className="pr-2">{e.actor}</td>
                  <td className="pr-2 text-neutral-500">{e.ip ?? ""}</td>
                  <td className="font-mono text-[9px] text-neutral-400">{String(e.hash).slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 text-neutral-500">
            Signed electronically under section 3A of the Information Technology Act, 2000, using typed or drawn signatures with each signer&apos;s email verified by a one-time
            code. The SHA-256 fingerprint of this PDF is recorded by {settings?.business_name}; anyone can check a copy at {process.env.NEXT_PUBLIC_SITE_URL ?? ""}/verify.
          </p>
        </section>
      </div>
    </>
  );
}
