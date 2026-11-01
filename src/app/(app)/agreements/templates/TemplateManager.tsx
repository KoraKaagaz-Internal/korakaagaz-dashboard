"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplate, saveTemplate } from "@/app/actions/agreements";
import { NumberInput } from "@/components/NumberInput";
import { AgreementBody } from "@/components/agreements/AgreementView";
import { Button, ConfirmButton, Field, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import type { Template } from "@/lib/agreement-data";
import { KINDS, KIND_LABEL, type AgreementKind, type PriceItem } from "@/lib/agreements";

type Draft = { id?: string; name: string; kind: AgreementKind; description: string; body: string; items: PriceItem[]; ends_after_months: number | null };
const EMPTY: Draft = { name: "", kind: "contract", description: "", body: "# {{title}}\n\n", items: [], ends_after_months: null };

export function TemplateManager({ templates, fields, canEdit }: { templates: Template[]; fields: { key: string; label: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();

  if (editing) {
    const e = editing;
    const set = (p: Partial<Draft>) => setEditing({ ...e, ...p });
    return (
      <div className="max-w-4xl space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input value={e.name} onChange={(x) => set({ name: x.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={e.kind} onChange={(x) => set({ kind: x.target.value as AgreementKind })}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usual length (months, for renewal reminders)">
            <NumberInput min={0} max={120} value={e.ends_after_months ?? 0} onValue={(n) => set({ ends_after_months: n || null })} />
          </Field>
        </div>
        <Field label="Short description">
          <Input value={e.description} onChange={(x) => set({ description: x.target.value })} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
            {preview ? "Edit text" : "Preview"}
          </Button>
          {!preview && (
            <Select className="!h-8 !w-auto !py-1" value="" onChange={(x) => x.target.value && set({ body: `${e.body}{{${x.target.value}}}` })} aria-label="Insert a field">
              <option value="">+ Insert a field…</option>
              {fields.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </Select>
          )}
        </div>
        {preview ? (
          <div className="rounded-xl border border-line bg-white p-6">
            <AgreementBody body={e.body} />
          </div>
        ) : (
          <Textarea className="min-h-[420px] font-mono text-[13px]" value={e.body} onChange={(x) => set({ body: x.target.value })} aria-label="Template text" />
        )}
        {e.kind === "proposal" && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Default pricing</div>
            {e.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_auto_auto] items-center gap-2">
                <Input aria-label="Item" value={it.title} onChange={(x) => set({ items: e.items.map((y, j) => (j === i ? { ...y, title: x.target.value } : y)) })} />
                <NumberInput aria-label="Amount" min={0} value={it.amount} onValue={(n) => set({ items: e.items.map((y, j) => (j === i ? { ...y, amount: n } : y)) })} />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={it.optional}
                    onChange={(x) => set({ items: e.items.map((y, j) => (j === i ? { ...y, optional: x.target.checked, selected: !x.target.checked } : y)) })}
                  />
                  Optional
                </label>
                <button type="button" className="text-sm text-danger" onClick={() => set({ items: e.items.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => set({ items: [...e.items, { title: "", description: "", amount: 0, optional: false, selected: true }] })}>
              + Add line
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveTemplate(e);
                if (!r.ok) return void toast.error(r.message);
                toast.success("Template saved");
                setEditing(null);
                router.refresh();
              })
            }
          >
            Save template
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button size="sm" onClick={() => setEditing(EMPTY)}>
          + New template
        </Button>
      )}
      <ul className="divide-y divide-line border-y border-line">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-neutral-500">
                {KIND_LABEL[t.kind]} · {t.description}
              </div>
            </div>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({ id: t.id, name: t.name, kind: t.kind, description: t.description, body: t.body, items: t.items, ends_after_months: t.ends_after_months })
                  }
                >
                  Edit
                </Button>
                <ConfirmButton
                  confirm={`Delete the template "${t.name}"? Agreements made from it keep their text.`}
                  confirmLabel="Delete"
                  onConfirm={() =>
                    start(async () => {
                      const r = await deleteTemplate(t.id);
                      if (!r.ok) return void toast.error(r.message);
                      router.refresh();
                    })
                  }
                >
                  Delete
                </ConfirmButton>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        These starter templates are plain-English and India-focused, but they aren&apos;t legal advice. Have your lawyer or CA review them once.
      </p>
    </div>
  );
}
