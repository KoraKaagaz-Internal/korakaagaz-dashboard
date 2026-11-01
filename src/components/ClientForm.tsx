"use client";

import { useState, useTransition } from "react";
import { saveClient } from "@/app/actions/catalog";
import { Field, Input, Select, Textarea, btn } from "@/components/ui";
import { GST_PORTAL_SEARCH, STATES, checkGstin, stateFromPin } from "@/lib/gst";
import type { Client } from "@/lib/types";

const EMPTY: Omit<Client, "id"> = { name: "", email: "", cc_emails: "", phone: "", address: "", city: "", pin: "", state_code: "", country: "India", gstin: "", notes: "" };

export function ClientForm({ client, onSaved, onCancel }: { client?: Client; onSaved: (c: Client) => void; onCancel?: () => void }) {
  const [form, setForm] = useState<Omit<Client, "id"> & { id?: string }>(client ?? { ...EMPTY });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const india = form.country.trim().toLowerCase() === "india";
  const gst = form.gstin ? checkGstin(form.gstin) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
      </Field>
      <Field label="Country">
        <Input value={form.country} onChange={(e) => set("country", e.target.value)} list="countries" />
        <datalist id="countries">
          {["India", "United States", "United Kingdom", "United Arab Emirates", "Singapore", "Australia", "Canada", "Germany"].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Email (invoices and reminders go here)">
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="CC emails (comma separated)">
        <Input value={form.cc_emails} onChange={(e) => set("cc_emails", e.target.value)} />
      </Field>
      <Field label="Phone / WhatsApp (with country code)">
        <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
      </Field>
      {india && (
        <Field label="GSTIN (if registered)">
          <Input
            value={form.gstin}
            onChange={(e) => {
              const g = e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15);
              const c = checkGstin(g);
              setForm((f) => ({ ...f, gstin: g, state_code: c.ok ? c.state : f.state_code }));
            }}
          />
          {gst && (
            <span className={`mt-1 block text-xs ${gst.ok ? "text-ok" : "text-danger"}`}>
              {gst.ok ? (
                <>
                  Valid format · {STATES[gst.state]} · PAN {gst.pan} ·{" "}
                  <a className="underline" href={GST_PORTAL_SEARCH} target="_blank" rel="noreferrer">
                    verify on GST portal
                  </a>
                </>
              ) : (
                gst.reason
              )}
            </span>
          )}
        </Field>
      )}
      <Field label="Address" className="sm:col-span-2">
        <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="City">
        <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={india ? "PIN code" : "Postcode"}>
          <Input
            value={form.pin}
            onChange={(e) => {
              const pin = e.target.value;
              const st = india ? stateFromPin(pin) : "";
              setForm((f) => ({ ...f, pin, state_code: st && !f.gstin ? st : f.state_code }));
            }}
          />
        </Field>
        {india && (
          <Field label="State">
            <Select value={form.state_code} onChange={(e) => set("state_code", e.target.value)} disabled={!!gst?.ok}>
              <option value="">Choose…</option>
              {Object.entries(STATES)
                .filter(([code]) => code !== "96")
                .map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          className={btn.primary}
          disabled={pending || !form.name.trim()}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await saveClient(form);
              if (r.ok) onSaved(r.client);
              else setError(r.message);
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
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
