"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reconcile2b } from "@/app/actions/expenses";
import { btn } from "@/components/ui";
import { formatMoney } from "@/lib/money";

/** Upload the GSTR-2B B2B sheet (saved as CSV) and match it against our bills for the month. */
export function Reconcile({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [res, setRes] = useState<Awaited<ReturnType<typeof reconcile2b>> | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-neutral-600">
        On the GST portal: Returns → GSTR-2B → download Excel. Open it, save the <b>B2B</b> sheet as CSV, and upload it here. We match on supplier GSTIN + bill number + tax.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={pending}
        aria-label="GSTR-2B CSV"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          start(async () => {
            const text = await f.text();
            setRes(await reconcile2b(text, from, to));
            router.refresh();
          });
        }}
      />
      {pending && <p className="text-neutral-500">Matching…</p>}
      {res && !res.ok && <p className="text-red-700" role="alert">{res.message}</p>}
      {res && res.ok && (
        <div role="status">
          <p>
            <b>{res.matched}</b> matched · <b className={res.mismatch ? "text-amber-800" : ""}>{res.mismatch}</b> tax differs · <b className={res.missing ? "text-red-700" : ""}>{res.missing}</b> not filed by the supplier yet
          </p>
          {res.notInBooks.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-neutral-600">{res.notInBooks.length} bills in 2B that aren&apos;t in your expenses</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                {res.notInBooks.map((b) => (
                  <li key={`${b.gstin}-${b.invoice_no}`}>
                    {b.gstin} · {b.invoice_no} · tax {formatMoney(b.tax)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button className={`${btn.ghost} mt-1`} onClick={() => setRes(null)}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
