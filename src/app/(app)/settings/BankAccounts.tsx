"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBankAccount, saveBankAccount } from "@/app/actions/settings";
import { Card, ConfirmButton, Field, Input, Textarea, btn } from "@/components/ui";
import type { BankAccount } from "@/lib/types";

const EMPTY = {
  label: "",
  account_name: "",
  account_no: "",
  ifsc: "",
  bank_name: "",
  branch_address: "",
  swift: "",
  iban: "",
  upi_id: "",
  is_default: false,
  opening_balance: 0,
  opening_date: "" as string | null,
  kind: "bank" as "bank" | "cash",
};

export function BankAccounts({ banks }: { banks: BankAccount[] }) {
  const router = useRouter();
  const [form, setForm] = useState<typeof EMPTY & { id?: string }>(banks.length ? EMPTY : { ...EMPTY, label: "Primary", is_default: true });
  const [open, setOpen] = useState(banks.length === 0);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY, v: string | boolean | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card
      title="Bank accounts and UPI"
      actions={
        !open && (
          <button
            className={btn.ghost}
            onClick={() => {
              setForm({ ...EMPTY, label: `Account ${banks.length + 1}` });
              setOpen(true);
            }}
          >
            + Add account
          </button>
        )
      }
    >
      <ul className="divide-y divide-line text-sm">
        {banks.map((b) => (
          <li key={b.id} className="flex items-start gap-3 py-2.5">
            <div className="flex-1">
              <div className="font-medium">
                {b.label} {b.is_default && <span className="ml-1 rounded-full bg-navy/10 px-2 py-0.5 text-xs text-navy">default</span>}
              </div>
              <div className="text-neutral-500">
                {[
                  b.kind === "cash" ? "Cash" : "",
                  b.bank_name,
                  b.account_no && `A/c ${b.account_no}`,
                  b.ifsc,
                  b.upi_id && `UPI ${b.upi_id}`,
                  b.swift && `SWIFT ${b.swift}`,
                  b.opening_date && `opening ₹${b.opening_balance.toLocaleString("en-IN")} on ${b.opening_date}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <button
              className={btn.ghost}
              onClick={() => {
                const { id, label, account_name, account_no, ifsc, bank_name, branch_address, swift, iban, upi_id, is_default, opening_balance, opening_date, kind } = b;
                setForm({
                  id,
                  label,
                  account_name,
                  account_no,
                  ifsc,
                  bank_name,
                  branch_address,
                  swift,
                  iban,
                  upi_id,
                  is_default,
                  opening_balance,
                  opening_date: opening_date ?? "",
                  kind,
                });
                setOpen(true);
              }}
            >
              Edit
            </button>
            <ConfirmButton
              disabled={pending}
              confirm={`Delete ${b.label}? Documents that used it keep their copy of the details.`}
              confirmLabel="Delete account"
              onConfirm={() =>
                start(async () => {
                  await deleteBankAccount(b.id);
                  router.refresh();
                })
              }
            >
              Delete
            </ConfirmButton>
          </li>
        ))}
      </ul>
      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <Field label="Label">
            <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Primary / USD account" />
          </Field>
          <Field label="Opening balance (₹)">
            <Input type="number" step="any" value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.valueAsNumber || 0)} />
          </Field>
          <Field label="Balance as of (date)">
            <Input type="date" value={form.opening_date ?? ""} onChange={(e) => set("opening_date", e.target.value)} />
          </Field>
          {form.kind !== "cash" && (
            <>
              <Field label="UPI ID (prints a scan-to-pay QR)">
                <Input value={form.upi_id} onChange={(e) => set("upi_id", e.target.value.trim())} placeholder="name@okhdfcbank" />
              </Field>
              <Field label="Account holder name">
                <Input value={form.account_name} onChange={(e) => set("account_name", e.target.value)} />
              </Field>
              <Field label="Account number">
                <Input value={form.account_no} onChange={(e) => set("account_no", e.target.value.replace(/\s/g, ""))} />
              </Field>
              <Field label="IFSC">
                <Input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Bank name">
                <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
              </Field>
              <Field label="Branch address" className="sm:col-span-2">
                <Textarea value={form.branch_address} onChange={(e) => set("branch_address", e.target.value)} />
              </Field>
              <Field label="SWIFT (for foreign clients)">
                <Input value={form.swift} onChange={(e) => set("swift", e.target.value.toUpperCase())} />
              </Field>
              <Field label="IBAN (optional)">
                <Input value={form.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.is_default} onChange={(e) => set("is_default", e.target.checked)} />
                Use by default on new documents
              </label>
            </>
          )}
          <p className="text-xs text-neutral-500 sm:col-span-2">
            The opening balance is what the account held on that date. Reports add money received and subtract expenses paid since then to show cash in hand and runway.
          </p>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              className={btn.primary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const { kind: _k, ...rest } = form;
                  void _k;
                  const r = await saveBankAccount(rest);
                  if (!r.ok) return setMsg(r.message);
                  setMsg("");
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Save account
            </button>
            {banks.length > 0 && (
              <button className={btn.secondary} onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
            {msg && <span className="text-sm text-danger">{msg}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
