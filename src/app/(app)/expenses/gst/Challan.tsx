"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveChallan } from "@/app/actions/expenses";
import { Field, Input, btn } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export function Challan({ month, amount, ids, today }: { month: string; amount: number; ids: string[]; today: string }) {
  const router = useRouter();
  const [c, setC] = useState({ challan_no: "", bsr_code: "", paid_on: today });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (!ids.length) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto] sm:items-end">
      <Field label="Challan no. (CIN)">
        <Input value={c.challan_no} onChange={(e) => setC({ ...c, challan_no: e.target.value })} />
      </Field>
      <Field label="BSR code">
        <Input value={c.bsr_code} onChange={(e) => setC({ ...c, bsr_code: e.target.value })} />
      </Field>
      <Field label="Deposited on">
        <Input type="date" value={c.paid_on} onChange={(e) => setC({ ...c, paid_on: e.target.value })} />
      </Field>
      <button
        className={btn.primary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await saveChallan({ month, amount, expense_ids: ids, ...c });
            setMsg(r.ok ? "Saved." : r.message);
            router.refresh();
          })
        }
      >
        Mark {formatMoney(amount)} deposited
      </button>
      {msg && <p className="text-sm text-neutral-700 sm:col-span-4">{msg}</p>}
    </div>
  );
}
