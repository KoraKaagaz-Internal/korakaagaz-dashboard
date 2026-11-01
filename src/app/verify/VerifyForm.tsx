"use client";

import { useState, useTransition } from "react";
import { verifyHash } from "./actions";

type Result = Awaited<ReturnType<typeof verifyHash>>;

export function VerifyForm() {
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<Result | "none" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 rounded-xl bg-white p-6 ring-1 ring-line">
      <input
        type="file"
        accept="application/pdf"
        aria-label="Signed PDF"
        className="block w-full text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setResult(null);
          start(async () => {
            const digest = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
            const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
            setHash(hex);
            setResult((await verifyHash(hex)) ?? "none");
          });
        }}
      />
      {pending && <p className="mt-3 text-sm text-neutral-500">Checking…</p>}
      {hash && <p className="mt-3 font-mono text-[11px] break-all text-neutral-500">SHA-256 {hash}</p>}
      {result === "none" && <p className="mt-3 text-sm font-medium text-danger">No match. This file isn&apos;t a signed copy from us, or it has been changed since signing.</p>}
      {result && result !== "none" && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-ok">
            ✓ Unchanged. This is the signed copy of {result.number}, “{result.title}”.
          </p>
          <ul className="mt-1 text-neutral-600">
            {result.signers.map((s) => (
              <li key={s.name}>
                {s.name} · signed {new Date(s.signed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
