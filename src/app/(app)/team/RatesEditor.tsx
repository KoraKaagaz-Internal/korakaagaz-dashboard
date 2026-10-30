"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setRates } from "@/app/actions/time";
import { NumberInput } from "@/components/NumberInput";
import { Card, btn } from "@/components/ui";
import type { Rate } from "@/lib/time-data";

/** Admin: private cost rates (for margins), billing rates and weekly capacity. */
export function RatesEditor({ rates }: { rates: Rate[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(rates);
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = (email: string, patch: Partial<Rate>) => setRows((r) => r.map((x) => (x.email === email ? { ...x, ...patch } : x)));
  return (
    <Card title="Rates and capacity (only you see this)">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Person</th>
              <th className="font-medium">Cost ₹/h</th>
              <th className="font-medium">Bill ₹/h</th>
              <th className="font-medium">Hours/week</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.email}>
                <td className="py-1.5 pr-2">
                  {r.name || r.email}
                  <span className="ml-1 text-xs text-neutral-400 capitalize">{r.role}</span>
                </td>
                <td className="pr-2">
                  <NumberInput className="!w-24" value={r.cost_rate} onValue={(v) => set(r.email, { cost_rate: v })} min={0} aria-label={`Cost rate for ${r.email}`} />
                </td>
                <td className="pr-2">
                  <NumberInput className="!w-24" value={r.bill_rate} onValue={(v) => set(r.email, { bill_rate: v })} min={0} aria-label={`Bill rate for ${r.email}`} />
                </td>
                <td className="pr-2">
                  <NumberInput className="!w-20" value={r.weekly_capacity_hours} onValue={(v) => set(r.email, { weekly_capacity_hours: v })} min={0} max={80} aria-label={`Weekly hours for ${r.email}`} />
                </td>
                <td>
                  <button
                    className={btn.ghost}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await setRates(r.email, r.cost_rate, r.bill_rate, r.weekly_capacity_hours);
                        if (!res.ok) return setMsg(res.message);
                        setMsg("");
                        setSaved(r.email);
                        router.refresh();
                      })
                    }
                  >
                    {saved === r.email ? "Saved" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Cost rate = what an hour of their time costs the studio (salary or freelancer fee ÷ hours). It powers project margins and is never shown to anyone else. Hours/week drives the workload view.</p>
      {msg && <p className="mt-1 text-sm text-red-700" role="alert">{msg}</p>}
    </Card>
  );
}
