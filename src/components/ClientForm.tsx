"use client";

import { useState, useTransition } from "react";
import { saveClient } from "@/app/actions";
import { Field, Input, Textarea, btn } from "@/components/ui";
import type { Client } from "@/lib/types";

const EMPTY = { name: "", address: "", gstin: "", email: "", phone: "" };

export function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: Client;
  onSaved: (c: Client) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(client ?? { id: "", ...EMPTY });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <Input value={form.name} onChange={set("name")} autoFocus />
      </Field>
      <Field label="GSTIN">
        <Input value={form.gstin} onChange={set("gstin")} />
      </Field>
      <Field label="Email">
        <Input value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Phone">
        <Input value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Textarea value={form.address} onChange={set("address")} />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          className={btn.primary}
          disabled={pending || !form.name.trim()}
          onClick={() =>
            start(async () => {
              try {
                setError("");
                onSaved(await saveClient({ ...form, id: form.id || undefined }));
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          {pending ? "Saving…" : "Save client"}
        </button>
        {onCancel && (
          <button type="button" className={btn.secondary} onClick={onCancel}>
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
