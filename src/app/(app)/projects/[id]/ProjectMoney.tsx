"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteProjectPayment, recordProjectPayment, saveSplit } from "@/app/actions/projects";
import { deleteExpense, recordExpensePayment } from "@/app/actions/expenses";
import { NumberInput } from "@/components/NumberInput";
import { SplitInput } from "@/components/pm/SplitInput";
import { Card, ConfirmButton, Input, Select, btn } from "@/components/ui";
import { useAction } from "@/components/ui/Toaster";
import { formatMoney, formatShortDate } from "@/lib/money";
import type { Person } from "@/lib/pm";

export interface PaymentRow {
  id: string;
  paid_on: string;
  amount: number;
  mode: string;
  note: string;
  invoice: { id: string; number: string } | null;
}

export interface SplitRow {
  id: string;
  name: string;
  amount: number;
  paid: number;
  balance: number;
}

/** Money received on the project: straight payments, plus payments on its invoices (read-only here). */
export function PaymentsCard({ projectId, rows, pendingAmount, today }: { projectId: string; rows: PaymentRow[]; pendingAmount: number; today: string }) {
  const [form, setForm] = useState({ paid_on: today, amount: 0, mode: "upi" as const, note: "" });
  const [record, recording] = useAction(recordProjectPayment, { success: "Payment recorded" });
  const [remove] = useAction(deleteProjectPayment, { success: "Payment removed" });
  return (
    <Card title="Payments received">
      {rows.length ? (
        <ul className="mb-4 divide-y divide-line text-sm">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="w-20 text-neutral-500">{formatShortDate(p.paid_on)}</span>
              <span className="min-w-0 flex-1 truncate text-neutral-600">
                {p.invoice ? (
                  <Link href={`/documents/${p.invoice.id}`} className="hover:text-navy">
                    Invoice {p.invoice.number}
                  </Link>
                ) : (
                  <span className="uppercase">{p.mode}</span>
                )}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <span className="tabular-nums">{formatMoney(p.amount)}</span>
              {!p.invoice && (
                <ConfirmButton confirm="Remove this payment?" confirmLabel="Remove" onConfirm={() => remove(p.id, projectId)}>
                  Remove
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-neutral-500">Nothing received yet. Log each payment the client makes, with or without an invoice.</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[130px_1fr_90px]">
        <Input type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} aria-label="Date received" />
        <NumberInput value={form.amount} onValue={(v) => setForm({ ...form, amount: v })} min={0} placeholder="Amount ₹" aria-label="Amount received" />
        <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })} aria-label="Paid by">
          <option value="upi">UPI</option>
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="wire">Wire</option>
        </Select>
        <Input className="col-span-2 sm:col-span-2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
        <button
          className={`${btn.primary} col-span-2 sm:col-span-1`}
          disabled={recording || !(form.amount > 0)}
          onClick={async () => {
            const r = await record({ project_id: projectId, ...form });
            if (r?.ok) setForm({ ...form, amount: 0, note: "" });
          }}
        >
          Record
        </button>
      </div>
      {pendingAmount > 0 && (
        <button type="button" className="mt-2 text-xs text-navy hover:underline" onClick={() => setForm({ ...form, amount: pendingAmount })}>
          Fill the full balance · {formatMoney(pendingAmount)}
        </button>
      )}
    </Card>
  );
}

/** Who gets what from this project, and what has been paid out. */
export function SplitCard({ projectId, rows, fee, people, today }: { projectId: string; rows: SplitRow[]; fee: number; people: Person[]; today: string }) {
  const [add, adding] = useAction(saveSplit, { success: "Added to the split" });
  const [pay, paying] = useAction(recordExpensePayment, { success: "Marked paid" });
  const [remove] = useAction(deleteExpense, { success: "Removed" });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card title={`Team split${total ? ` · ${formatMoney(total)}` : ""}`}>
      {rows.length ? (
        <ul className="mb-4 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
              <Link href={`/expenses/${r.id}`} className="min-w-0 flex-1 truncate hover:text-navy">
                {r.name}
                {fee > 0 && <span className="text-xs text-neutral-400"> · {Math.round((r.amount / fee) * 100)}%</span>}
              </Link>
              <span className="tabular-nums">{formatMoney(r.amount)}</span>
              {r.balance > 0.5 ? (
                <>
                  <button className={btn.ghost} disabled={paying} onClick={() => pay(r.id, { paid_on: today, amount: r.balance, mode: "upi" })}>
                    Mark paid
                  </button>
                  {r.paid === 0 && (
                    <ConfirmButton confirm={`Remove ${r.name} from the split?`} confirmLabel="Remove" onConfirm={() => remove(r.id)}>
                      Remove
                    </ConfirmButton>
                  )}
                </>
              ) : (
                <span className="text-xs font-medium text-ok">Paid</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-neutral-500">Add what each team member or freelancer gets from this project, as ₹ or % of the fee.</p>
      )}
      <SplitInput people={people} fee={fee} pending={adding} onAdd={(s) => add({ project_id: projectId, ...s })} />
    </Card>
  );
}
