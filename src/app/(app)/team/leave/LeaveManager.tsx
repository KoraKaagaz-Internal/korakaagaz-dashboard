"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelLeave, decideLeave, deleteHoliday, requestLeave, saveHoliday } from "@/app/actions/time";
import { Card, Field, Input, Select, btn } from "@/components/ui";
import { formatInvoiceDate } from "@/lib/money";
import { displayName, type Person } from "@/lib/pm";
import type { LeaveRow } from "@/lib/time-data";

const STATUS: Record<string, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", declined: "bg-neutral-200 text-neutral-600" };

export function LeaveManager({
  leave,
  holidays,
  people,
  me,
  isAdmin,
  today,
}: {
  leave: LeaveRow[];
  holidays: { day: string; name: string }[];
  people: Person[];
  me: string;
  isAdmin: boolean;
  today: string;
}) {
  const router = useRouter();
  const [f, setF] = useState({ from_date: today, to_date: today, half_day: false, kind: "casual" as "casual" | "sick" | "unpaid" | "other", note: "" });
  const [h, setH] = useState({ day: "", name: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (ok ? { ok: true, text: ok } : null) : { ok: false, text: r.message ?? "Something went wrong" });
      if (r.ok) after?.();
      router.refresh();
    });
  const range = (l: LeaveRow) =>
    l.from_date === l.to_date ? `${formatInvoiceDate(l.from_date)}${l.half_day ? " (half day)" : ""}` : `${formatInvoiceDate(l.from_date)} – ${formatInvoiceDate(l.to_date)}`;
  const pendingList = leave.filter((l) => l.status === "pending");

  return (
    <div className="space-y-5">
      <Card title="Ask for leave">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="From">
            <Input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: f.to_date < e.target.value ? e.target.value : f.to_date })} />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={f.to_date}
              min={f.from_date}
              onChange={(e) => setF({ ...f, to_date: e.target.value, half_day: f.half_day && e.target.value === f.from_date })}
            />
          </Field>
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="unpaid">Unpaid</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={f.half_day} disabled={f.from_date !== f.to_date} onChange={(e) => setF({ ...f, half_day: e.target.checked })} />
            Half day
          </label>
          <Field label="Note (optional)" className="sm:col-span-3">
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Family function, back on Monday" />
          </Field>
          <div className="flex items-end">
            <button className={btn.primary} disabled={pending} onClick={() => run(() => requestLeave(f), isAdmin ? "Added. Approve it below." : "Sent to the admin.")}>
              Request
            </button>
          </div>
        </div>
        {msg && (
          <p className={`mt-2 text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">
            {msg.text}
          </p>
        )}
      </Card>

      {isAdmin && pendingList.length > 0 && (
        <Card title={`Waiting for you · ${pendingList.length}`}>
          <ul className="divide-y divide-neutral-100 text-sm">
            {pendingList.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-36 font-medium">{displayName(l.member_email, people)}</span>
                <span className="flex-1">
                  {range(l)} · <span className="capitalize">{l.kind}</span>
                  {l.note && <span className="text-neutral-500"> · {l.note}</span>}
                </span>
                <button className={btn.secondary} disabled={pending} onClick={() => run(() => decideLeave(l.id, true))}>
                  Approve
                </button>
                <button className={btn.ghost} disabled={pending} onClick={() => run(() => decideLeave(l.id, false))}>
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Leave">
        {leave.length ? (
          <ul className="divide-y divide-neutral-100 text-sm">
            {leave.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-36">{displayName(l.member_email, people)}</span>
                <span className="flex-1">
                  {range(l)} · <span className="capitalize">{l.kind}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[l.status]}`}>{l.status}</span>
                {l.status === "pending" && l.member_email === me && (
                  <button className={btn.ghost} onClick={() => run(() => cancelLeave(l.id))}>
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No leave in the last 90 days or coming up.</p>
        )}
      </Card>

      <Card title="Studio holidays">
        <ul className="divide-y divide-neutral-100 text-sm">
          {holidays.map((x) => (
            <li key={x.day} className="flex items-center gap-3 py-1.5">
              <span className={`w-36 ${x.day < today ? "text-neutral-400" : ""}`}>{formatInvoiceDate(x.day)}</span>
              <span className="flex-1">{x.name}</span>
              {isAdmin && (
                <button className="text-xs text-neutral-400 hover:text-red-600" onClick={() => run(() => deleteHoliday(x.day))} aria-label={`Remove ${x.name}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input className="!w-44" type="date" value={h.day} onChange={(e) => setH({ ...h, day: e.target.value })} aria-label="Holiday date" />
            <Input className="!w-64" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="Diwali" aria-label="Holiday name" />
            <button
              className={btn.secondary}
              disabled={!h.day || !h.name.trim() || pending}
              onClick={() =>
                run(
                  () => saveHoliday(h.day, h.name),
                  undefined,
                  () => setH({ day: "", name: "" }),
                )
              }
            >
              Add holiday
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
