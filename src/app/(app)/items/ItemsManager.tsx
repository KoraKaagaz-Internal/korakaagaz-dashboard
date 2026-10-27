"use client";

import { useState, useTransition } from "react";
import { deleteItem, saveItem } from "@/app/actions/catalog";
import { Card, Field, Input, Textarea, btn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { CatalogItem } from "@/lib/types";

const EMPTY = { name: "", description: "", sac: "998391", unit_price: 0 };

export function ItemsManager({ initial, canEdit }: { initial: CatalogItem[]; canEdit: boolean }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card title={form.id ? "Edit item" : "New item"}>
          <div className="grid gap-3 sm:grid-cols-[1fr_110px_130px]">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Brand identity system" />
            </Field>
            <Field label="SAC">
              <Input value={form.sac} onChange={(e) => setForm({ ...form, sac: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
            </Field>
            <Field label="Rate (₹)">
              <Input type="number" min={0} value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.valueAsNumber || 0 })} />
            </Field>
            <Field label="Description" className="sm:col-span-3">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className={btn.primary}
              disabled={pending || !form.name.trim()}
              onClick={() =>
                start(async () => {
                  const r = await saveItem(form);
                  if (!r.ok) return setMsg(r.message);
                  setItems((l) => [...l.filter((x) => x.id !== r.item.id), r.item].sort((a, b) => a.name.localeCompare(b.name)));
                  setForm(EMPTY);
                  setMsg("");
                })
              }
            >
              Save item
            </button>
            {form.id && (
              <button className={btn.secondary} onClick={() => setForm(EMPTY)}>
                Cancel
              </button>
            )}
            {msg && <span className="text-sm text-red-600">{msg}</span>}
          </div>
        </Card>
      )}
      <Card>
        {items.length === 0 && <p className="text-sm text-neutral-500">No items yet.</p>}
        <ul className="divide-y divide-neutral-100">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{it.name}</div>
                <div className="text-neutral-500">
                  {it.sac && `SAC ${it.sac} · `}
                  {it.description}
                </div>
              </div>
              <span className="tabular-nums">{formatMoney(it.unit_price)}</span>
              {canEdit && (
                <>
                  <button className={btn.ghost} onClick={() => setForm({ id: it.id, name: it.name, description: it.description, sac: it.sac, unit_price: it.unit_price })}>
                    Edit
                  </button>
                  <button
                    className={btn.danger}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await deleteItem(it.id);
                        if (r.ok) setItems((l) => l.filter((x) => x.id !== it.id));
                      })
                    }
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
