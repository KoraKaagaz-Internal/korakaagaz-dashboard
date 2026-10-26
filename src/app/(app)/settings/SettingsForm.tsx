"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/actions";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import type { Settings } from "@/lib/types";

export function SettingsForm({ settings: s }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="space-y-5">
      <Card title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <Input name="business_name" defaultValue={s.business_name} required />
          </Field>
          <Field label="PAN">
            <Input name="pan" defaultValue={s.pan} />
          </Field>
          <Field label="GSTIN (optional)">
            <Input name="gstin" defaultValue={s.gstin} />
          </Field>
        </div>
      </Card>

      <Card title="Payment details (printed on every invoice)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UPI ID">
            <Input name="upi_id" defaultValue={s.upi_id} />
          </Field>
          <Field label="Account number">
            <Input name="bank_account_no" defaultValue={s.bank_account_no} />
          </Field>
          <Field label="IFSC code">
            <Input name="bank_ifsc" defaultValue={s.bank_ifsc} />
          </Field>
          <Field label="Bank address" className="sm:col-span-2">
            <Textarea name="bank_address" defaultValue={s.bank_address} />
          </Field>
        </div>
      </Card>

      <Card title="For any queries">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input name="query_email" defaultValue={s.query_email} />
          </Field>
          <Field label="Phone">
            <Input name="query_phone" defaultValue={s.query_phone} />
          </Field>
        </div>
      </Card>

      <Card title="Numbering and defaults">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Invoice prefix">
            <Input name="invoice_prefix" defaultValue={s.invoice_prefix} required />
          </Field>
          <Field label="Next number">
            <Input name="next_number" type="number" min={1} defaultValue={s.next_number} required />
          </Field>
          <Field label="Currency">
            <Input name="default_currency" defaultValue={s.default_currency} required />
          </Field>
          <Field label="Payment terms" className="sm:col-span-3">
            <Input name="default_payment_terms" defaultValue={s.default_payment_terms} />
          </Field>
          <Field label="GST">
            <Select name="default_gst_mode" defaultValue={s.default_gst_mode}>
              <option value="none">No GST</option>
              <option value="cgst_sgst">CGST + SGST (same state)</option>
              <option value="igst">IGST (other state)</option>
            </Select>
          </Field>
          <Field label="GST rate %">
            <Input name="default_gst_rate" type="number" step="0.01" min={0} defaultValue={s.default_gst_rate} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Numbers look like {s.invoice_prefix}-{new Date().getFullYear()}-{String(s.next_number).padStart(3, "0")}.
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button className={btn.primary} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state && <span className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
