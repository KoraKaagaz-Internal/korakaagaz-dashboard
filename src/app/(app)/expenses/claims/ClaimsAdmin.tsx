"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideClaims, payClaims } from "@/app/actions/expenses";
import { Card, Field, Input, Select, btn } from "@/components/ui";
import { formatInvoiceDate, formatMoney } from "@/lib/money";

interface Claim {
  id: string;
  created_by: string;
  expense_date: string;
  description: string;
  vendor: string;
  category: string;
  total: number;
  balance: number;
  receipt: boolean;
}

function Selectable({ list, sel, setSel, names }: { list: Claim[]; sel: Set<string>; setSel: (s: Set<string>) => void; names: Record<string, string> }) {
  return (
    <ul className="divide-y divide-neutral-100 text-sm">
      {list.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={sel.has(c.id)}
            aria-label={`Select claim ${c.description || c.vendor}`}
            onChange={() => {
              const n = new Set(sel);
              if (n.has(c.id)) n.delete(c.id);
              else n.add(c.id);
              setSel(n);
            }}
          />
          <span className="w-28 truncate">{names[c.created_by] || c.created_by.split("@")[0]}</span>
          <Link href={`/expenses/${c.id}`} className="min-w-0 flex-1 truncate hover:text-navy">
            {c.description || c.vendor || c.category}
            <span className="text-neutral-500">
              {" "}
              · {c.category} · {formatInvoiceDate(c.expense_date).replace(/, \d{4}$/, "")}
              {c.receipt ? " · 📎" : " · no receipt"}
            </span>
          </Link>
          <span className="tabular-nums">{formatMoney(c.balance || c.total)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ClaimsAdmin({ pending, approved, names, accounts, today }: { pending: Claim[]; approved: Claim[]; names: Record<string, string>; accounts: { id: string; label: string }[]; today: string }) {
  const router = useRouter();
  const [selA, setSelA] = useState<Set<string>>(new Set(pending.map((c) => c.id)));
  const [selP, setSelP] = useState<Set<string>>(new Set(approved.map((c) => c.id)));
  const [note, setNote] = useState("");
  const [pay, setPay] = useState({ paid_on: today, mode: "upi" as "upi" | "bank" | "cash", account_id: accounts[0]?.id ?? "", reference: "" });
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const sum = (list: Claim[], sel: Set<string>) => list.filter((c) => sel.has(c.id)).reduce((s, c) => s + (c.balance || c.total), 0);

  return (
    <div className="space-y-5">
      <Card title={`Waiting for approval · ${pending.length}`}>
        {pending.length ? (
          <>
            <Selectable list={pending} sel={selA} setSel={setSelA} names={names} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className={btn.primary}
                disabled={!selA.size || busy}
                onClick={() =>
                  start(async () => {
                    const r = await decideClaims([...selA], true);
                    setMsg(r.ok ? `Approved ${r.count}.` : r.message);
                    router.refresh();
                  })
                }
              >
                Approve ({formatMoney(sum(pending, selA))})
              </button>
              <Input className="!w-64" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, if sending back" aria-label="Reason" />
              <button
                className={btn.secondary}
                disabled={!selA.size || busy}
                onClick={() =>
                  start(async () => {
                    const r = await decideClaims([...selA], false, note);
                    setMsg(r.ok ? `Sent back ${r.count}.` : r.message);
                    router.refresh();
                  })
                }
              >
                Send back
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Nothing waiting.</p>
        )}
      </Card>

      <Card title={`Approved, to reimburse · ${approved.length}`}>
        {approved.length ? (
          <>
            <Selectable list={approved} sel={selP} setSel={setSelP} names={names} />
            <div className="mt-3 grid gap-2 sm:grid-cols-[140px_110px_1fr_1fr_auto] sm:items-end">
              <Field label="Paid on">
                <Input type="date" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
              </Field>
              <Field label="How">
                <Select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value as typeof pay.mode })}>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                </Select>
              </Field>
              <Field label="From account">
                <Select value={pay.account_id} onChange={(e) => setPay({ ...pay, account_id: e.target.value })}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reference">
                <Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UTR" />
              </Field>
              <button
                className={btn.primary}
                disabled={!selP.size || busy}
                onClick={() =>
                  start(async () => {
                    const r = await payClaims([...selP], { ...pay, account_id: pay.account_id || null });
                    setMsg(r.ok ? `Reimbursed ${r.count} claim${r.count === 1 ? "" : "s"}: ${formatMoney(r.total)}.` : r.message);
                    router.refresh();
                  })
                }
              >
                Mark paid ({formatMoney(sum(approved, selP))})
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Nothing to reimburse.</p>
        )}
      </Card>
      {msg && <p className="text-sm text-neutral-700" role="status">{msg}</p>}
    </div>
  );
}
