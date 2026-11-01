"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { invoiceFromExpenses } from "@/app/actions/expenses";
import { btn } from "@/components/ui";

export function InvoiceFromExpenses({ projectId, count }: { projectId: string; count: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        className={btn.primary}
        disabled={!count || pending}
        onClick={() =>
          start(async () => {
            const r = await invoiceFromExpenses(projectId);
            if (!r.ok) return setMsg(r.message);
            router.push(`/documents/${r.id}/edit`);
          })
        }
      >
        {pending ? "Drafting…" : `Draft invoice from ${count} billable expense${count === 1 ? "" : "s"}`}
      </button>
      {msg && (
        <span className="text-sm text-danger" role="alert">
          {msg}
        </span>
      )}
    </span>
  );
}
