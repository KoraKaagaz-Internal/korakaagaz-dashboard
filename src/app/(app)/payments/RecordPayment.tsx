"use client";

import { useMemo, useState } from "react";
import { recordPayment } from "@/app/actions/payments";
import { recordProjectPayment } from "@/app/actions/projects";
import { INVOICE_FILES, uploadInvoice } from "@/app/(app)/projects/[id]/ProjectMoney";
import { NumberInput } from "@/components/NumberInput";
import { Card, Field, Input, Select, btn } from "@/components/ui";
import { useAction } from "@/components/ui/Toaster";
import { formatMoney } from "@/lib/money";
import { PAY_MODES, type PayTarget } from "@/lib/payments";

/**
 * Record money received, for a project or an invoice. The amount starts at what's pending,
 * and each click carries a request id so a double-click or retry can't save twice.
 */
export function RecordPayment({ targets, today, initial }: { targets: PayTarget[]; today: string; initial?: string }) {
  const [q, setQ] = useState("");
  const [key, setKey] = useState(initial && targets.some((t) => t.key === initial) ? initial : "");
  const target = targets.find((t) => t.key === key) ?? null;
  const [invoiceId, setInvoiceId] = useState("");
  const [f, setF] = useState({ paid_on: today, amount: target?.pending || NaN, tds: NaN, mode: "upi" as (typeof PAY_MODES)[number][0], reference: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [over, setOver] = useState("");
  const [saveInvoice, savingInvoice] = useAction(recordPayment, { success: "Payment recorded" });
  const [saveProject, savingProject] = useAction(recordProjectPayment, { success: "Payment recorded" });
  const [attach, attaching] = useAction(uploadInvoice, { success: "Invoice attached" });
  const busy = savingInvoice || savingProject || attaching;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return targets.filter((x) => x.key === key || !t || `${x.label} ${x.client}`.toLowerCase().includes(t));
  }, [targets, q, key]);
  const invoice = target?.kind === "invoice" ? { id: target.id, balance: target.pending } : (target?.invoices.find((i) => i.id === invoiceId) ?? null);
  const due = invoice ? invoice.balance : (target?.pending ?? 0);
  const total = (f.amount || 0) + (f.tds || 0);

  const pick = (k: string) => {
    const t = targets.find((x) => x.key === k);
    setKey(k);
    setInvoiceId("");
    setOver("");
    setF((x) => ({ ...x, amount: t?.pending || NaN }));
  };
  const done = () => {
    setF((x) => ({ ...x, amount: NaN, tds: NaN, reference: "", note: "" }));
    setFile(null);
    setOver("");
    setKey("");
    setRequestId(crypto.randomUUID());
  };
  const submit = async (allowOver = false) => {
    if (!target) return;
    const common = { paid_on: f.paid_on, amount: f.amount || 0, tds_amount: f.tds || 0, mode: f.mode, reference: f.reference, note: f.note, request_id: requestId };
    if (invoice) {
      const r = await saveInvoice({ ...common, document_id: invoice.id, tds_section: "" });
      if (r?.ok) done();
      return;
    }
    const r = await saveProject({ ...common, project_id: target.id, allow_over: allowOver });
    if (r && !r.ok && "over" in r) return setOver(r.message);
    if (!r?.ok) return;
    if (file) await attach(r.id, file);
    done();
  };

  return (
    <Card title="Record a payment">
      <div className="space-y-3">
        <Field label="For">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, project or invoice" aria-label="Search what was paid" className="mb-2" />
          <Select value={key} onChange={(e) => pick(e.target.value)} aria-label="Project or invoice">
            <option value="">Pick a project or invoice…</option>
            {shown.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
                {t.client ? ` · ${t.client}` : ""}
                {t.pending > 0 ? ` · ${formatMoney(t.pending)} pending` : " · fully paid"}
              </option>
            ))}
          </Select>
        </Field>
        {target?.kind === "project" && target.invoices.length > 0 && (
          <Field label="Against invoice">
            <Select
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = target.invoices.find((i) => i.id === e.target.value);
                setF((x) => ({ ...x, amount: inv ? inv.balance : target.pending || NaN }));
              }}
            >
              <option value="">No invoice: just the project</option>
              {target.invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} · {formatMoney(i.balance)} due
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount received (₹)">
            <NumberInput value={f.amount} onValue={(v) => setF({ ...f, amount: v })} min={0} aria-label="Amount received" />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.paid_on} max={today} onChange={(e) => setF({ ...f, paid_on: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as typeof f.mode })}>
              {PAY_MODES.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="UTR / reference">
            <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="TDS deducted (₹)">
            <NumberInput value={f.tds} onValue={(v) => setF({ ...f, tds: v })} min={0} placeholder="0" aria-label="TDS deducted" />
          </Field>
          <Field label="Note">
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        {target && !invoice && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-neutral-600 hover:border-navy">
            <span aria-hidden>📎</span>
            <span className="truncate">{file ? file.name : "Attach the invoice you sent (PDF or photo, optional)"}</span>
            <input type="file" accept={INVOICE_FILES} className="sr-only" aria-label="Attach invoice" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {target && total > 0 && (
          <p className="text-xs text-neutral-500">
            {total > due + 0.5 && due > 0
              ? `${formatMoney(total - due)} more than the ${formatMoney(due)} pending.`
              : due > 0
                ? `${formatMoney(Math.max(0, due - total))} will still be pending after this.`
                : "Nothing was pending on this one."}
          </p>
        )}
        {over ? (
          <div className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" role="alert">
            {over} Was it extra work?
            <span className="mt-2 flex gap-2">
              <button className={btn.primary} disabled={busy} onClick={() => submit(true)}>
                Record anyway
              </button>
              <button className={btn.secondary} onClick={() => setOver("")}>
                Change amount
              </button>
            </span>
          </div>
        ) : (
          <button className={`${btn.primary} w-full`} disabled={busy || !target || !(f.amount > 0)} onClick={() => submit()}>
            {busy ? "Saving…" : `Record ${f.amount > 0 ? formatMoney(f.amount) : "payment"}`}
          </button>
        )}
      </div>
    </Card>
  );
}
