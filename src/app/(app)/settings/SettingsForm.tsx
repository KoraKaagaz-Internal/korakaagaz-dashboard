"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettings, saveSignature } from "@/app/actions/settings";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { STATES, checkGstin } from "@/lib/gst";
import { DEFAULT_MESSAGES, PLACEHOLDERS } from "@/lib/messages";
import { financialYear, todayIso } from "@/lib/money";
import { DOC_LABELS, DOC_TYPES, type MessageKind, type Settings } from "@/lib/types";

const MESSAGE_LABELS: Record<MessageKind, string> = {
  email_subject: "Email subject",
  email_body: "Email message",
  whatsapp: "WhatsApp message",
  reminder_subject: "Reminder subject",
  reminder_body: "Reminder message",
};

export function SettingsForm({ settings, mailReady }: { settings: Settings; mailReady: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const gst = s.gstin ? checkGstin(s.gstin) : null;
  const fy = financialYear(todayIso());

  const save = () =>
    start(async () => {
      const r = await saveSettings({ ...s, prefixes: s.prefixes, terms: s.terms as Record<string, string>, message_templates: s.message_templates as Record<string, string> });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });

  const uploadSignature = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      start(async () => {
        const r = await saveSignature(String(reader.result));
        if (!r.ok) setMsg({ ok: false, text: r.message });
        else {
          set("signature_path", String(reader.result));
          router.refresh();
        }
      });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      <Card title="Business (printed on every document)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Brand name">
            <Input value={s.business_name} onChange={(e) => set("business_name", e.target.value)} />
          </Field>
          <Field label="Legal name (if different)">
            <Input value={s.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea value={s.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="State">
            <Select value={s.state_code} onChange={(e) => set("state_code", e.target.value)}>
              {Object.entries(STATES)
                .filter(([c]) => c !== "96")
                .map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="GSTIN (leave empty if not registered)">
            <Input value={s.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
            {gst && <span className={`mt-1 block text-xs ${gst.ok ? "text-ok" : "text-danger"}`}>{gst.ok ? `Valid · ${STATES[gst.state]}` : gst.reason}</span>}
          </Field>
          <Field label="PAN">
            <Input value={s.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} />
          </Field>
          <Field label={`LUT number (for export invoices, FY ${fy})`}>
            <Input value={s.lut_number} onChange={(e) => setS({ ...s, lut_number: e.target.value, lut_fy: fy })} />
            {s.lut_number && s.lut_fy && s.lut_fy !== fy && (
              <span className="mt-1 block text-xs text-warn">
                This LUT is for FY {s.lut_fy}. File a new one for {fy}.
              </span>
            )}
          </Field>
          <Field label="Queries email">
            <Input value={s.query_email} onChange={(e) => set("query_email", e.target.value)} />
          </Field>
          <Field label="Queries phone">
            <Input value={s.query_phone} onChange={(e) => set("query_phone", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Authorised signatory">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={s.signatory_name} onChange={(e) => set("signatory_name", e.target.value)} />
          </Field>
          <Field label="Signature / stamp image (PNG, under 150 KB)">
            <input type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={(e) => uploadSignature(e.target.files?.[0])} />
          </Field>
          {s.signature_path && (
            <div className="flex items-center gap-3 sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.signature_path} alt="Signature" className="h-10 rounded border border-line bg-white p-1" />
              <button
                className={btn.danger}
                onClick={() =>
                  start(async () => {
                    await saveSignature(null);
                    set("signature_path", null);
                    router.refresh();
                  })
                }
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Numbering and defaults">
        <p className="mb-3 text-sm text-neutral-500">
          Numbers look like{" "}
          <code>
            {s.prefixes.invoice}/{fy}/001
          </code>
          : max 16 characters, a new series every 1 April, as GST Rule 46 requires.
        </p>
        <div className="grid gap-3 sm:grid-cols-5">
          {DOC_TYPES.map((t) => (
            <Field key={t} label={`${DOC_LABELS[t].short} prefix`}>
              <Input value={s.prefixes[t]} maxLength={5} onChange={(e) => set("prefixes", { ...s.prefixes, [t]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
            </Field>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Currency">
            <Input value={s.default_currency} maxLength={3} onChange={(e) => set("default_currency", e.target.value.toUpperCase())} />
          </Field>
          <Field label="Due in (days)">
            <Input type="number" min={0} value={s.default_due_days} onChange={(e) => set("default_due_days", e.target.valueAsNumber || 0)} />
          </Field>
          <Field label="Default SAC">
            <Input value={s.default_sac} onChange={(e) => set("default_sac", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Default GST %">
            <Input type="number" min={0} step="any" value={s.default_gst_rate} onChange={(e) => set("default_gst_rate", e.target.valueAsNumber || 0)} />
          </Field>
          <Field label="GST returns">
            <Select value={s.gst_filing ?? "monthly"} onChange={(e) => set("gst_filing", e.target.value as "monthly" | "qrmp" | "none")}>
              <option value="monthly">Monthly</option>
              <option value="qrmp">Quarterly (QRMP)</option>
              <option value="none">Not registered</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.require_approval} onChange={(e) => set("require_approval", e.target.checked)} />
            Members&apos; documents need my approval before they&apos;re issued
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.reminders_enabled} onChange={(e) => set("reminders_enabled", e.target.checked)} />
            Send automatic payment reminders (each invoice can still opt out)
          </label>
        </div>
      </Card>

      <Card title="Default terms by document type">
        <div className="space-y-3">
          {DOC_TYPES.map((t) => (
            <Field key={t} label={DOC_LABELS[t].title}>
              <Textarea
                value={s.terms[t] ?? ""}
                placeholder={
                  t === "quote"
                    ? "Valid for 15 days. Two rounds of revisions included. IP transfers on full payment."
                    : t === "invoice"
                      ? "Payment by UPI or bank transfer. Late payments may attract interest."
                      : ""
                }
                onChange={(e) => set("terms", { ...s.terms, [t]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Email and WhatsApp messages">
        <p className="mb-3 text-sm text-neutral-500">
          Placeholders: {PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}. Leave a box empty to use the default.
          {!mailReady && " Email sending from team@korakaagaz.co isn't set up yet: until then, emails are logged as skipped."}
        </p>
        <div className="space-y-3">
          {(Object.keys(MESSAGE_LABELS) as MessageKind[]).map((k) => (
            <Field key={k} label={MESSAGE_LABELS[k]}>
              {k.endsWith("subject") ? (
                <Input
                  value={s.message_templates[k] ?? ""}
                  placeholder={DEFAULT_MESSAGES[k]}
                  onChange={(e) => set("message_templates", { ...s.message_templates, [k]: e.target.value })}
                />
              ) : (
                <Textarea
                  rows={4}
                  value={s.message_templates[k] ?? ""}
                  placeholder={DEFAULT_MESSAGES[k]}
                  onChange={(e) => set("message_templates", { ...s.message_templates, [k]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t border-black/5 bg-subtle/95 py-3 backdrop-blur">
        <button className={btn.primary} disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
