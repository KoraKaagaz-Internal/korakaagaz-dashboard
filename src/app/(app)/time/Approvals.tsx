"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideTime } from "@/app/actions/time";
import { Card, Input, btn } from "@/components/ui";
import { formatInvoiceDate, formatShortDate } from "@/lib/money";
import { hhmm, weekStart } from "@/lib/time";

interface Row {
  id: string;
  member_email: string;
  work_date: string;
  minutes: number;
  note: string;
  project_code: string;
  project_name: string;
  task_title: string;
}

/** Admin: submitted time grouped by person and week; approve or send back. */
export function Approvals({ rows, names }: { rows: Row[]; names: Record<string, string> }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(rows.map((r) => r.id)));
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.member_email}|${weekStart(r.work_date)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideTime([...sel], approve, reason);
      setMsg(r.ok ? `${approve ? "Approved" : "Sent back"} ${r.count} entr${r.count === 1 ? "y" : "ies"}.` : r.message);
      setSel(new Set());
      router.refresh();
    });

  if (!rows.length)
    return (
      <Card>
        <p className="text-sm text-neutral-500">Nothing waiting for approval.</p>
      </Card>
    );

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([k, list]) => {
        const [email, monday] = k.split("|");
        const all = list.every((r) => sel.has(r.id));
        return (
          <Card
            key={k}
            title={`${names[email] || email} · week of ${formatInvoiceDate(monday)} · ${hhmm(list.reduce((s, r) => s + r.minutes, 0))} h`}
            actions={
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      list.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
                      return n;
                    })
                  }
                />
                All
              </label>
            }
          >
            <ul className="divide-y divide-line text-sm">
              {list.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    aria-label={`Select ${r.work_date} ${r.task_title || r.project_name}`}
                    onChange={() =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  />
                  <span className="w-24 text-xs text-neutral-500">{formatShortDate(r.work_date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.project_code} · {r.task_title || r.project_name}
                    {r.note && <span className="text-neutral-500"> · {r.note}</span>}
                  </span>
                  <span className="w-14 text-right tabular-nums">{hhmm(r.minutes)}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn.primary} disabled={!sel.size || pending} onClick={() => decide(true)}>
          Approve selected ({sel.size})
        </button>
        <Input className="!w-72" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, if sending back" aria-label="Reason for sending back" />
        <button className={btn.secondary} disabled={!sel.size || pending} onClick={() => decide(false)}>
          Send back
        </button>
        {msg && (
          <span className="text-sm text-neutral-600" role="status">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
