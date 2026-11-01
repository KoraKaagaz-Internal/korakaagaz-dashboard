"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { priceTotals, type PriceItem } from "@/lib/agreements";
import { formatMoney } from "@/lib/money";
import { decline, sendCode, sign } from "./actions";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy";

export function SignPanel({
  token,
  name: initialName,
  title,
  pricing,
  studioEmail,
}: {
  token: string;
  name: string;
  title: string;
  pricing: { items: PriceItem[]; gstRate: number; currency: string } | null;
  studioEmail: string;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<number[]>(() => (pricing ? pricing.items.flatMap((i, n) => (i.optional && i.selected ? [n] : [])) : []));
  const [codeSent, setCodeSent] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState(initialName);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const totals = pricing
    ? priceTotals(
        pricing.items.map((i, n) => ({ ...i, selected: !i.optional || choices.includes(n) })),
        pricing.gstRate,
      )
    : null;

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height] as const;
  };

  return (
    <section className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-line sm:p-8" aria-label="Sign">
      {pricing && totals && (
        <div className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Choose your options</h2>
          <ul className="divide-y divide-line">
            {pricing.items.map((i, n) => (
              <li key={n} className="flex items-start gap-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!i.optional || choices.includes(n)}
                  disabled={!i.optional}
                  onChange={(e) => setChoices((c) => (e.target.checked ? [...c, n] : c.filter((x) => x !== n)))}
                  aria-label={i.title}
                />
                <span className="flex-1">
                  <span className="font-medium">{i.title}</span>
                  {!i.optional && <span className="ml-2 text-xs text-neutral-500">included</span>}
                  {i.description && <span className="block text-xs text-neutral-500">{i.description}</span>}
                </span>
                <span className="tabular-nums">{formatMoney(i.amount, pricing.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end gap-6 border-t border-line pt-2 text-sm">
            <span className="text-neutral-500">
              {formatMoney(totals.subtotal, pricing.currency)} + GST {pricing.gstRate}%
            </span>
            <span className="font-semibold tabular-nums">{formatMoney(totals.total, pricing.currency)}</span>
          </div>
        </div>
      )}

      <h2 className="text-base font-semibold">Sign “{title}”</h2>
      {!codeSent ? (
        <div className="mt-3">
          <p className="text-sm text-neutral-600">First, we&apos;ll email you a 6-digit code to confirm it&apos;s you.</p>
          <button
            className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await sendCode(token);
                if (r.ok) setCodeSent(r.message ?? "Code sent.");
                setMsg(r.ok ? null : { ok: false, text: r.message });
              })
            }
          >
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </div>
      ) : (
        <form
          className="mt-3 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const image = drawn && canvas.current ? canvas.current.toDataURL("image/png") : null;
            start(async () => {
              const r = await sign(token, { code, name, image, consent, choices });
              setMsg({ ok: r.ok, text: r.message ?? "" });
              if (r.ok) router.refresh();
            });
          }}
        >
          <p className="text-sm text-neutral-600">
            {codeSent}{" "}
            <button type="button" className="text-navy underline" disabled={pending} onClick={() => start(async () => setCodeSent((await sendCode(token)).message ?? ""))}>
              Send again
            </button>
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Code from the email</span>
            <input
              className={`${input} max-w-40 tracking-[0.3em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Your full name (this is your signature)</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
          </label>
          {name.trim() && <p className="font-serif text-3xl text-ink italic">{name}</p>}
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-600">Or draw it (optional)</span>
            <canvas
              ref={canvas}
              width={600}
              height={160}
              className="h-28 w-full max-w-md touch-none rounded-lg border border-dashed border-line bg-white"
              aria-label="Draw your signature"
              onPointerDown={(e) => {
                drawing.current = true;
                const ctx = e.currentTarget.getContext("2d")!;
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.strokeStyle = "#1a1a2d";
                ctx.beginPath();
                ctx.moveTo(...pos(e));
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = e.currentTarget.getContext("2d")!;
                ctx.lineTo(...pos(e));
                ctx.stroke();
                setDrawn(true);
              }}
              onPointerUp={() => (drawing.current = false)}
            />
            {drawn && (
              <button
                type="button"
                className="mt-1 text-xs text-neutral-500 underline"
                onClick={() => {
                  canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 160);
                  setDrawn(false);
                }}
              >
                Clear drawing
              </button>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I&apos;ve read this document and agree to sign it electronically. My typed name (or drawing) is my signature.</span>
          </label>
          <button className="rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60" disabled={pending || code.length !== 6 || !consent}>
            {pending ? "Signing…" : totals ? `Accept and sign · ${formatMoney(totals.total, pricing!.currency)}` : "Sign"}
          </button>
        </form>
      )}
      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">
          {msg.text}
        </p>
      )}

      <div className="mt-6 border-t border-line pt-4 text-sm">
        {!declining ? (
          <button className="text-neutral-500 underline" onClick={() => setDeclining(true)}>
            I don&apos;t want to sign this
          </button>
        ) : (
          <div className="space-y-2">
            <textarea className={input} rows={2} placeholder="Optional: tell the studio why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-danger px-3 py-1.5 text-danger disabled:opacity-60"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await decline(token, reason);
                    setMsg({ ok: r.ok, text: r.message ?? "" });
                    if (r.ok) router.refresh();
                  })
                }
              >
                Decline
              </button>
              <button className="px-3 py-1.5 text-neutral-500" onClick={() => setDeclining(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {studioEmail && <p className="mt-3 text-xs text-neutral-400">Questions? Write to {studioEmail}.</p>}
      </div>
    </section>
  );
}
