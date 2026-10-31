"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { attachReceipt, saveExpense, tdsHint, type ExpenseInput } from "@/app/actions/expenses";
import { NumberInput } from "@/components/NumberInput";
import { safeName, shrinkImage } from "@/components/pm/Files";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import type { Category, Expense, Vendor } from "@/lib/expense-data";
import { TDS_NATURES, nextRecurring, purchaseGst, type ExpenseKind } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const RATES = [0, 5, 12, 18, 28, 40];
const MAX = 50 * 1024 * 1024;

export function ExpenseForm({
  expense,
  categories,
  vendors,
  projects,
  accounts,
  ourState,
  today,
  canEdit,
  defaults,
}: {
  expense: Expense | null;
  categories: Category[];
  vendors: Vendor[];
  projects: { id: string; code: string; name: string }[];
  accounts: { id: string; label: string; kind: "bank" | "cash" }[];
  ourState: string;
  today: string;
  canEdit: boolean;
  defaults?: { kind?: ExpenseKind; project_id?: string; vendor_id?: string };
}) {
  const router = useRouter();
  const startKind: ExpenseKind = expense?.kind ?? (canEdit ? (defaults?.kind ?? "receipt") : "claim");
  const [f, setF] = useState({
    kind: startKind,
    vendor_id: expense?.vendor_id ?? defaults?.vendor_id ?? "",
    vendor_name: expense?.vendor_id ? "" : (expense?.vendor_name ?? ""),
    category_id: expense?.category_id ?? "",
    expense_date: expense?.expense_date ?? today,
    bill_no: expense?.bill_no ?? "",
    description: expense?.description ?? "",
    project_id: expense?.project_id ?? defaults?.project_id ?? "",
    taxable: expense?.taxable ?? 0,
    gst_rate: expense?.gst_rate ?? 18,
    rcm: expense?.rcm ?? false,
    itc_status: expense?.itc_status ?? ("eligible" as Expense["itc_status"]),
    tds_nature: expense?.tds_nature ?? "none",
    tds_rate: expense?.tds_rate ?? 0,
    paid_from: (expense?.paid_from === "member" ? "bank" : expense?.paid_from) ?? ("bank" as "bank" | "petty_cash"),
    due_date: expense?.due_date ?? "",
    billable: expense?.billable ?? false,
    markup_pct: expense?.markup_pct ?? 0,
    recurring: expense?.recurring?.every ?? "",
    notes: expense?.notes ?? "",
  });
  const [gross, setGross] = useState(false); // amount typed includes GST
  const [typed, setTyped] = useState(expense ? expense.taxable : 0);
  const [pay, setPay] = useState({
    account_id: accounts.find((a) => a.kind === "bank")?.id ?? "",
    mode: "upi" as "upi" | "bank" | "cash" | "card" | "cheque",
    reference: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const vendor = vendors.find((v) => v.id === f.vendor_id);
  const category = categories.find((c) => c.id === f.category_id);
  const unregistered = !!vendor && !vendor.gstin;
  // a claim is what the person actually paid; the bill isn't in the studio's name, so no GST credit
  const claim = f.kind === "claim";
  const rate = claim || (unregistered && !f.rcm) ? 0 : f.gst_rate;
  const taxable = gross && rate ? Math.round((typed / (1 + rate / 100)) * 100) / 100 : typed;
  const gst = purchaseGst({
    taxable,
    rate,
    supplierState: vendor?.state_code ?? "",
    ourState,
    rcm: f.rcm,
  });
  const tds = f.kind === "claim" || f.tds_nature === "none" ? 0 : Math.round(taxable * f.tds_rate) / 100;

  // category defaults: ITC rule, TDS nature, reverse charge
  const pickCategory = (id: string) => {
    const c = categories.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      category_id: id,
      itc_status: c?.itc_rule === "blocked" ? "blocked" : c?.itc_rule === "none" ? "ineligible" : "eligible",
      tds_nature: vendor?.tds_nature && vendor.tds_nature !== "none" ? vendor.tds_nature : (c?.tds_nature ?? "none"),
      rcm: c?.rcm ?? false,
      billable: c?.kind === "pass_through" && !!x.project_id ? true : x.billable,
    }));
  };
  const pickVendor = (id: string) => {
    const v = vendors.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      vendor_id: id,
      vendor_name: "",
      tds_nature: v?.tds_nature ?? x.tds_nature,
    }));
    if (v?.default_category_id && !f.category_id) pickCategory(v.default_category_id);
  };

  // TDS suggestion from the vendor's running total this financial year
  useEffect(() => {
    if (!canEdit || f.kind === "claim" || !f.vendor_id || f.tds_nature === "none" || taxable <= 0) {
      setHint("");
      return;
    }
    const id = setTimeout(() => {
      tdsHint(f.vendor_id, f.expense_date, taxable, f.tds_nature, expense?.id)
        .then((h) => {
          setF((x) => ({ ...x, tds_rate: h.rate }));
          setHint(`${h.reason}${h.paidThisYear ? ` (₹${h.paidThisYear.toLocaleString("en-IN")} billed earlier this FY)` : ""}.`);
        })
        .catch(() => {});
    }, 350);
    return () => clearTimeout(id);
  }, [canEdit, f.kind, f.vendor_id, f.tds_nature, f.expense_date, taxable, expense?.id]);

  const itcNote = useMemo(() => {
    if (gst.tax === 0) return unregistered ? "Vendor has no GSTIN: no GST, no input credit." : "";
    if (f.itc_status === "blocked") return `Input credit blocked (s.17(5)) for ${category?.name ?? "this category"}: the GST is a cost.`;
    if (f.rcm) return "Reverse charge: pay this GST to the government yourself, then claim it back as input credit.";
    return `${formatMoney(gst.tax)} GST claimable as input credit once the vendor files it (GSTR-2B).`;
  }, [gst.tax, f.itc_status, f.rcm, unregistered, category?.name]);

  const submit = () =>
    start(async () => {
      setMsg("");
      if (!f.category_id) return setMsg("Pick a category");
      if (file && file.size > MAX) return setMsg("Receipt is over 50 MB");
      const input: ExpenseInput = {
        id: expense?.id,
        kind: f.kind,
        vendor_id: f.vendor_id || null,
        vendor_name: f.vendor_name,
        category_id: f.category_id,
        expense_date: f.expense_date,
        bill_no: f.bill_no,
        description: f.description,
        project_id: f.project_id || null,
        taxable,
        gst_rate: rate,
        rcm: f.rcm,
        itc_status: f.itc_status,
        tds_nature: f.tds_nature,
        tds_rate: f.tds_rate,
        paid_from: f.kind === "claim" ? "member" : f.paid_from,
        due_date: f.kind === "bill" ? f.due_date || null : null,
        billable: f.billable && !!f.project_id,
        markup_pct: f.markup_pct,
        recurring: f.recurring
          ? {
              every: f.recurring as "month",
              next: nextRecurring(f.expense_date, f.recurring as "month"),
            }
          : null,
        notes: f.notes,
        pay_now:
          !expense && f.kind === "receipt"
            ? {
                account_id: pay.account_id || null,
                mode: f.paid_from === "petty_cash" ? "cash" : pay.mode,
                reference: pay.reference,
              }
            : null,
      };
      const r = await saveExpense(input);
      if (!r.ok) return setMsg(r.message);
      if (file) {
        const small = await shrinkImage(file);
        const path = `expenses/${r.id}/${crypto.randomUUID()}-${safeName(small.name)}`;
        const { error } = await createClient()
          .storage.from("files")
          .upload(path, small, {
            contentType: small.type || "application/octet-stream",
          });
        if (error) return setMsg(`Saved, but the receipt didn't upload: ${error.message}`);
        const a = await attachReceipt(r.id, path, small.name);
        if (!a.ok) return setMsg(`Saved, but the receipt didn't attach: ${a.message}`);
      }
      router.push(f.kind === "claim" && !canEdit ? "/expenses/claims" : `/expenses/${r.id}`);
      router.refresh();
    });

  const kinds: { key: ExpenseKind; label: string; hint: string }[] = [
    ...(canEdit
      ? [
          {
            key: "receipt" as const,
            label: "Paid already",
            hint: "Receipt: the studio has paid",
          },
          {
            key: "bill" as const,
            label: "Bill to pay",
            hint: "Vendor bill due later",
          },
        ]
      : []),
    {
      key: "claim",
      label: "I paid (claim)",
      hint: "You spent your own money; the studio reimburses you",
    },
  ];

  return (
    <div className="space-y-5">
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={f.kind === k.key}
              onClick={() => setF({ ...f, kind: k.key })}
              disabled={!!expense && expense.kind !== k.key && (expense.kind === "claim" || k.key === "claim")}
              className={`rounded-xl px-4 py-2 text-left text-sm ring-1 ${f.kind === k.key ? "bg-navy/5 ring-2 ring-navy" : "bg-white ring-black/10"} disabled:opacity-40`}
            >
              <div className="font-medium">{k.label}</div>
              <div className="text-xs text-neutral-500">{k.hint}</div>
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {canEdit && f.kind !== "claim" ? (
            <Field label="Vendor">
              <Select value={f.vendor_id} onChange={(e) => pickVendor(e.target.value)}>
                <option value="">— not in the list —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.gstin ? "" : " (no GSTIN)"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {(!f.vendor_id || f.kind === "claim") && (
            <Field label={f.kind === "claim" ? "Paid to (shop or person)" : "Or vendor name"}>
              <Input value={f.vendor_name} onChange={(e) => setF({ ...f, vendor_name: e.target.value })} placeholder="Ola, Amazon, Bloom Florists…" />
            </Field>
          )}
          <Field label="Category">
            <Select value={f.category_id} onChange={(e) => pickCategory(e.target.value)}>
              <option value="">Choose…</option>
              {categories
                .filter((c) => c.active || c.id === f.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.expense_date} max={today} onChange={(e) => setF({ ...f, expense_date: e.target.value })} />
          </Field>
          <Field label="Bill / invoice no.">
            <Input value={f.bill_no} onChange={(e) => setF({ ...f, bill_no: e.target.value })} placeholder="Needed to claim GST credit" />
          </Field>
          <Field label="What for" className="sm:col-span-2">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Props for the Acme shoot" />
          </Field>
        </div>
        {canEdit && (
          <p className="mt-2 text-xs text-neutral-500">
            Vendor not listed?{" "}
            <Link href="/vendors?new=1" className="text-navy underline">
              Add a vendor
            </Link>{" "}
            to track GSTIN, PAN and TDS.
          </p>
        )}
      </Card>

      <Card title={claim ? "Amount" : "Amount and GST"}>
        {claim ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Amount you paid (₹)">
              <NumberInput value={typed} onValue={setTyped} min={0} />
            </Field>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label={gross ? "Amount incl. GST (₹)" : "Amount before GST (₹)"}>
                <NumberInput value={typed} onValue={setTyped} min={0} />
              </Field>
              <Field label="GST rate">
                <Select value={rate} disabled={unregistered && !f.rcm} onChange={(e) => setF({ ...f, gst_rate: Number(e.target.value) })}>
                  {RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={gross} onChange={(e) => setGross(e.target.checked)} />
                The amount I typed includes GST
              </label>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-5">
              <dt className="text-neutral-500">Taxable</dt>
              <dd className="tabular-nums sm:col-span-4">{formatMoney(taxable)}</dd>
              {gst.igst > 0 ? (
                <>
                  <dt className="text-neutral-500">IGST</dt>
                  <dd className="tabular-nums sm:col-span-4">{formatMoney(gst.igst)}</dd>
                </>
              ) : gst.tax > 0 ? (
                <>
                  <dt className="text-neutral-500">CGST + SGST</dt>
                  <dd className="tabular-nums sm:col-span-4">
                    {formatMoney(gst.cgst)} + {formatMoney(gst.sgst)}
                  </dd>
                </>
              ) : null}
              <dt className="font-medium">{f.rcm ? "Pay vendor" : "Bill total"}</dt>
              <dd className="font-semibold tabular-nums sm:col-span-4">{formatMoney(gst.total)}</dd>
              {tds > 0 && (
                <>
                  <dt className="text-neutral-500">Less TDS</dt>
                  <dd className="tabular-nums sm:col-span-4">
                    − {formatMoney(tds)} → pay {formatMoney(gst.total - tds)}
                  </dd>
                </>
              )}
            </dl>
            {itcNote && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{itcNote}</p>}
          </>
        )}
        {canEdit && f.kind !== "claim" && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-600">GST credit and TDS settings</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Input credit">
                <Select
                  value={f.itc_status}
                  onChange={(e) =>
                    setF({
                      ...f,
                      itc_status: e.target.value as Expense["itc_status"],
                    })
                  }
                >
                  <option value="eligible">Claimable</option>
                  <option value="blocked">Blocked (s.17(5))</option>
                  <option value="ineligible">Not claimable</option>
                </Select>
              </Field>
              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" checked={f.rcm} onChange={(e) => setF({ ...f, rcm: e.target.checked })} />
                Reverse charge (e.g. advocate&apos;s fees)
              </label>
              <div />
              <Field label="TDS">
                <Select
                  value={f.tds_nature}
                  onChange={(e) =>
                    setF({
                      ...f,
                      tds_nature: e.target.value,
                      tds_rate: TDS_NATURES.find((n) => n.code === e.target.value)?.rate ?? 0,
                    })
                  }
                >
                  {TDS_NATURES.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="TDS rate %">
                <NumberInput value={f.tds_rate} onValue={(v) => setF({ ...f, tds_rate: v })} min={0} max={30} disabled={f.tds_nature === "none"} />
              </Field>
              {hint && <p className="self-end pb-2 text-xs text-neutral-600">{hint}</p>}
            </div>
            <p className="mt-2 text-xs text-neutral-500">TDS is worked out on the amount before GST. Rates and limits are FY 2025-26; check with your CA.</p>
          </details>
        )}
      </Card>

      <Card title="Payment">
        {f.kind === "receipt" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Paid from">
              <Select
                value={f.paid_from}
                onChange={(e) =>
                  setF({
                    ...f,
                    paid_from: e.target.value as "bank" | "petty_cash",
                  })
                }
              >
                <option value="bank">Bank / UPI / card</option>
                <option value="petty_cash">Petty cash</option>
              </Select>
            </Field>
            {!expense && f.paid_from === "bank" && (
              <>
                <Field label="Account">
                  <Select value={pay.account_id} onChange={(e) => setPay({ ...pay, account_id: e.target.value })}>
                    <option value="">—</option>
                    {accounts
                      .filter((a) => a.kind === "bank")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="How">
                  <Select
                    value={pay.mode}
                    onChange={(e) =>
                      setPay({
                        ...pay,
                        mode: e.target.value as typeof pay.mode,
                      })
                    }
                  >
                    <option value="upi">UPI</option>
                    <option value="bank">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </Select>
                </Field>
              </>
            )}
          </div>
        )}
        {f.kind === "bill" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Due date">
              <Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </Field>
            {vendor?.msme && <p className="self-end pb-2 text-xs text-amber-800 sm:col-span-2">MSME vendor: pay within 45 days (15 without a written agreement).</p>}
          </div>
        )}
        {f.kind === "claim" && <p className="text-sm text-neutral-600">The admin approves it, then reimburses you. You&apos;ll get a notification at each step.</p>}
      </Card>

      <Card title="Project and re-billing">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Project (optional)">
            <Select
              value={f.project_id}
              onChange={(e) =>
                setF({
                  ...f,
                  project_id: e.target.value,
                  billable: e.target.value ? f.billable || category?.kind === "pass_through" : false,
                })
              }
            >
              <option value="">— studio overhead —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {canEdit && f.project_id && (
            <>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} />
                Bill this to the client
              </label>
              {f.billable && (
                <Field label="Markup %">
                  <NumberInput value={f.markup_pct} onValue={(v) => setF({ ...f, markup_pct: v })} min={0} />
                </Field>
              )}
            </>
          )}
        </div>
        {canEdit && f.kind !== "claim" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Repeats">
              <Select value={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.value })}>
                <option value="">Doesn&apos;t repeat</option>
                <option value="month">Every month</option>
                <option value="quarter">Every quarter</option>
                <option value="year">Every year</option>
              </Select>
            </Field>
            {f.recurring && (
              <p className="self-end pb-2 text-xs text-neutral-500 sm:col-span-2">
                A draft copy appears on {nextRecurring(f.expense_date, f.recurring as "month")} for you to confirm.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Receipt and notes">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium tracking-wide text-neutral-500 uppercase">{expense?.receipt_path ? "Replace receipt" : "Receipt (photo or PDF)"}</span>
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {expense?.receipt_name && !file && <p className="text-xs text-neutral-500">Attached: {expense.receipt_name}</p>}
          <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" aria-label="Notes" />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button className={btn.primary} disabled={pending || taxable <= 0} onClick={submit}>
          {pending ? "Saving…" : f.kind === "claim" && !expense ? "Submit claim" : "Save"}
        </button>
        <button className={btn.secondary} onClick={() => router.back()}>
          Cancel
        </button>
        {msg && (
          <p className="text-sm text-red-700" role="alert">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
