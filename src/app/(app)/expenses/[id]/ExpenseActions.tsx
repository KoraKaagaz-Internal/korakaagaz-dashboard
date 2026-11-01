"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmDraft, deleteExpense, deleteExpensePayment, receiptUrl, recordExpensePayment } from "@/app/actions/expenses";
import { NumberInput } from "@/components/NumberInput";
import { ConfirmButton, Field, Input, Select, btn } from "@/components/ui";
import { formatInvoiceDate, formatMoney } from "@/lib/money";

export function ReceiptButton({ id, name }: { id: string; name: string }) {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span>
      <button
        className={btn.secondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await receiptUrl(id);
            if (r.ok) window.open(r.url, "_blank", "noopener");
            else setMsg(r.message);
          })
        }
      >
        Open receipt{name ? ` (${name.length > 24 ? `${name.slice(0, 22)}…` : name})` : ""}
      </button>
      {msg && <span className="ml-2 text-sm text-red-700">{msg}</span>}
    </span>
  );
}

export function Payments({
  expenseId,
  balance,
  payments,
  accounts,
  canPay,
  today,
}: {
  expenseId: string;
  balance: number;
  payments: { id: string; paid_on: string; amount: number; mode: string; reference: string; account: string }[];
  accounts: { id: string; label: string; kind: string }[];
  canPay: boolean;
  today: string;
}) {
  const router = useRouter();
  const [p, setP] = useState({ paid_on: today, amount: balance, mode: "upi" as "upi" | "bank" | "cash" | "card" | "cheque", account_id: accounts[0]?.id ?? "", reference: "" });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {payments.length > 0 ? (
        <ul className="divide-y divide-neutral-100 text-sm">
          {payments.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-1.5">
              <span className="w-28 text-neutral-600">{formatInvoiceDate(x.paid_on)}</span>
              <span className="flex-1 text-neutral-600 capitalize">
                {x.mode}
                {x.account ? ` · ${x.account}` : ""}
                {x.reference ? ` · ${x.reference}` : ""}
              </span>
              <span className="tabular-nums">{formatMoney(x.amount)}</span>
              {canPay && (
                <button
                  className="text-xs text-neutral-400 hover:text-red-600"
                  onClick={() =>
                    start(async () => {
                      const r = await deleteExpensePayment(x.id, expenseId);
                      if (!r.ok) setMsg(r.message);
                      router.refresh();
                    })
                  }
                  aria-label="Remove payment"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">No payments yet.</p>
      )}
      {canPay && balance > 0.005 && (
        <div className="grid gap-2 sm:grid-cols-[140px_130px_120px_1fr_1fr_auto] sm:items-end">
          <Field label="Date">
            <Input type="date" value={p.paid_on} onChange={(e) => setP({ ...p, paid_on: e.target.value })} />
          </Field>
          <Field label="Amount">
            <NumberInput value={p.amount} onValue={(v) => setP({ ...p, amount: v })} min={0} />
          </Field>
          <Field label="How">
            <Select value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value as typeof p.mode })}>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
            </Select>
          </Field>
          <Field label="From account">
            <Select value={p.account_id} onChange={(e) => setP({ ...p, account_id: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} placeholder="UTR / cheque no." />
          </Field>
          <button
            className={btn.primary}
            disabled={pending || p.amount <= 0}
            onClick={() =>
              start(async () => {
                const r = await recordExpensePayment(expenseId, { ...p, account_id: p.account_id || null });
                setMsg(r.ok ? "" : r.message);
                router.refresh();
              })
            }
          >
            Record payment
          </button>
        </div>
      )}
      {msg && (
        <p className="text-sm text-red-700" role="alert">
          {msg}
        </p>
      )}
    </div>
  );
}

export function Danger({ id, isDraft, canDelete, back }: { id: string; isDraft: boolean; canDelete: boolean; back: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isDraft && (
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await confirmDraft(id);
              if (!r.ok) setMsg(r.message);
              router.refresh();
            })
          }
        >
          Confirm this recurring expense
        </button>
      )}
      {canDelete && (
        <ConfirmButton
          size="md"
          disabled={pending}
          confirm="Delete this expense and its receipt? This can't be undone."
          confirmLabel="Delete"
          onConfirm={() =>
            start(async () => {
              const r = await deleteExpense(id);
              if (!r.ok) return setMsg(r.message);
              router.push(back);
              router.refresh();
            })
          }
        >
          Delete
        </ConfirmButton>
      )}
      {msg && (
        <span className="text-sm text-red-700" role="alert">
          {msg}
        </span>
      )}
    </div>
  );
}
