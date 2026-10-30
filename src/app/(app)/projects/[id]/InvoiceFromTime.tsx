"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { invoiceFromTime } from "@/app/actions/time";
import { btn } from "@/components/ui";

export function InvoiceFromTime({ projectId, ready }: { projectId: string; ready: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className={btn.primary}
        disabled={pending || !ready}
        onClick={() =>
          start(async () => {
            const r = await invoiceFromTime(projectId);
            if (!r.ok) return setMsg(r.message);
            router.push(`/documents/${r.id}/edit`);
          })
        }
      >
        {pending ? "Drafting…" : "Draft invoice from approved time"}
      </button>
      <span className="text-sm text-neutral-500">{ready ? `${ready} h ready to bill` : "No approved, billable time waiting."}</span>
      {msg && <span className="text-sm text-red-700" role="alert">{msg}</span>}
    </div>
  );
}
