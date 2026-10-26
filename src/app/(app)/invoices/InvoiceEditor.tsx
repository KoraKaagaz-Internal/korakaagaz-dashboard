"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshPaymentDetails, saveInvoice } from "@/app/actions";
import { ClientForm } from "@/components/ClientForm";
import { InvoiceTemplate } from "@/components/invoice/InvoiceTemplate";
import { ScaledPreview } from "@/components/invoice/ScaledPreview";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { computeTotals, formatAmount } from "@/lib/money";
import type { Client, InvoiceDraft, InvoiceStatus, LineItem, PaymentSnapshot } from "@/lib/types";

const EMPTY_ITEM: LineItem = { title: "", description: "", qty: 1, unit_price: 0 };

export function InvoiceEditor({
  id,
  initial,
  clients: initialClients,
  payment,
  numberPlaceholder,
  status,
}: {
  id?: string;
  initial: InvoiceDraft;
  clients: Client[];
  payment: PaymentSnapshot;
  numberPlaceholder?: string;
  status?: InvoiceStatus;
}) {
  const router = useRouter();
  const [inv, setInv] = useState<InvoiceDraft>(initial);
  const [clients, setClients] = useState(initialClients);
  const [addingClient, setAddingClient] = useState(false);
  const [error, setError] = useState("");
  const [saving, start] = useTransition();

  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setInv((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<LineItem>) =>
    setInv((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const moveItem = (i: number, dir: -1 | 1) =>
    setInv((p) => {
      const items = [...p.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return p;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...p, items };
    });

  const pickClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return set("client_id", null);
    const { id: cid, ...snapshot } = c;
    setInv((p) => ({ ...p, client_id: cid, client: snapshot }));
  };

  const totals = computeTotals(inv);
  const money = (n: number) => formatAmount(n, inv.currency);

  const save = (thenDownload = false) =>
    start(async () => {
      setError("");
      const result = await saveInvoice({ ...inv, id });
      if (result.error || !result.id) return setError(result.error ?? "Could not save");
      if (thenDownload) window.location.href = `/api/invoices/${result.id}/pdf`;
      router.push(`/invoices/${result.id}/edit`);
      router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{id ? `Invoice ${inv.number}` : "New invoice"}</h1>
          {status && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize">{status}</span>}
        </div>

        <Card
          title="Billed to"
          actions={
            !addingClient && (
              <button type="button" className={btn.ghost} onClick={() => setAddingClient(true)}>
                + New client
              </button>
            )
          }
        >
          {addingClient ? (
            <ClientForm
              onCancel={() => setAddingClient(false)}
              onSaved={(c) => {
                setClients((l) => [...l, c].sort((a, b) => a.name.localeCompare(b.name)));
                const { id: cid, ...snapshot } = c;
                setInv((p) => ({ ...p, client_id: cid, client: snapshot }));
                setAddingClient(false);
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Saved client" className="sm:col-span-2">
                <Select value={inv.client_id ?? ""} onChange={(e) => pickClient(e.target.value)}>
                  <option value="">— Type details below —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Name">
                <Input value={inv.client.name} onChange={(e) => set("client", { ...inv.client, name: e.target.value })} />
              </Field>
              <Field label="GSTIN">
                <Input value={inv.client.gstin} onChange={(e) => set("client", { ...inv.client, gstin: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Textarea
                  value={inv.client.address}
                  onChange={(e) => set("client", { ...inv.client, address: e.target.value })}
                />
              </Field>
            </div>
          )}
        </Card>

        <Card title="Details">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Invoice no.">
              <Input
                value={inv.number}
                placeholder={numberPlaceholder ? `${numberPlaceholder} (auto)` : ""}
                onChange={(e) => set("number", e.target.value)}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={inv.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={inv.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
            </Field>
            <Field label="Currency">
              <Input value={inv.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Field>
            <Field label="Payment terms" className="sm:col-span-2">
              <Input value={inv.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Line items">
          <div className="space-y-4">
            {inv.items.map((item, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
                  <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ml-auto" />
                  <button type="button" className={btn.ghost} onClick={() => moveItem(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className={btn.ghost}
                    onClick={() => moveItem(i, 1)}
                    disabled={i === inv.items.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={btn.danger}
                    disabled={inv.items.length === 1}
                    onClick={() => set("items", inv.items.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_80px_120px]">
                  <Input placeholder="Title" value={item.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    aria-label="Quantity"
                    value={Number.isNaN(item.qty) ? "" : item.qty}
                    onChange={(e) => setItem(i, { qty: e.target.valueAsNumber })}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    aria-label="Unit price"
                    value={Number.isNaN(item.unit_price) ? "" : item.unit_price}
                    onChange={(e) => setItem(i, { unit_price: e.target.valueAsNumber })}
                  />
                  <Textarea
                    className="sm:col-span-3"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <button type="button" className={btn.secondary} onClick={() => set("items", [...inv.items, { ...EMPTY_ITEM }])}>
              + Add line item
            </button>
          </div>
        </Card>

        <Card title="Discount and GST">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Discount">
              <Select
                value={inv.discount_type}
                onChange={(e) => set("discount_type", e.target.value as InvoiceDraft["discount_type"])}
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="flat">Flat amount</option>
              </Select>
            </Field>
            <Field label="Value">
              <Input
                type="number"
                min={0}
                step="any"
                disabled={inv.discount_type === "none"}
                value={inv.discount_value}
                onChange={(e) => set("discount_value", e.target.valueAsNumber || 0)}
              />
            </Field>
            <Field label="GST">
              <Select value={inv.gst_mode} onChange={(e) => set("gst_mode", e.target.value as InvoiceDraft["gst_mode"])}>
                <option value="none">No GST</option>
                <option value="cgst_sgst">CGST + SGST</option>
                <option value="igst">IGST</option>
              </Select>
            </Field>
            <Field label="Rate %">
              <Input
                type="number"
                min={0}
                step="any"
                disabled={inv.gst_mode === "none"}
                value={inv.gst_rate}
                onChange={(e) => set("gst_rate", e.target.valueAsNumber || 0)}
              />
            </Field>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-neutral-500">Subtotal</dt>
            <dd className="text-right">{money(totals.subtotal)}</dd>
            {totals.discount > 0 && (
              <>
                <dt className="text-neutral-500">Discount</dt>
                <dd className="text-right">− {money(totals.discount)}</dd>
              </>
            )}
            {totals.tax > 0 && (
              <>
                <dt className="text-neutral-500">GST</dt>
                <dd className="text-right">{money(totals.tax)}</dd>
              </>
            )}
            <dt className="font-semibold text-navy">Total ({inv.currency})</dt>
            <dd className="text-right font-semibold text-navy">{money(totals.total)}</dd>
          </dl>
        </Card>

        <Card title="Notes (optional, printed under the items)">
          <Textarea value={inv.notes} onChange={(e) => set("notes", e.target.value)} />
        </Card>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-black/5 bg-[#f4f4f6]/95 py-3 backdrop-blur">
          <button type="button" className={btn.primary} disabled={saving} onClick={() => save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className={btn.secondary} disabled={saving} onClick={() => save(true)}>
            Save and download PDF
          </button>
          {id && (
            <button
              type="button"
              className={btn.ghost}
              disabled={saving}
              title="Payment details are copied when the invoice is created. Use this after changing Settings."
              onClick={() =>
                start(async () => {
                  await refreshPaymentDetails(id);
                  router.refresh();
                })
              }
            >
              Use current payment details
            </button>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto">
        <ScaledPreview>
          <InvoiceTemplate invoice={{ ...inv, number: inv.number || numberPlaceholder || "" }} payment={payment} />
        </ScaledPreview>
      </div>
    </div>
  );
}
