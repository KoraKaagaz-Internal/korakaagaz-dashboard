"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVendor, saveVendor } from "@/app/actions/expenses";
import { Card, ConfirmButton, Field, Input, Select, Textarea, btn } from "@/components/ui";
import type { Category, Vendor } from "@/lib/expense-data";
import { TDS_NATURES } from "@/lib/expenses";
import { GST_PORTAL_SEARCH, STATES, checkGstin } from "@/lib/gst";

const EMPTY = {
  name: "",
  kind: "vendor",
  gstin: "",
  pan: "",
  state_code: "",
  email: "",
  phone: "",
  address: "",
  bank_details: "",
  upi_id: "",
  default_category_id: "",
  tds_nature: "none",
  is_company: false,
  msme: false,
  notes: "",
};

export function VendorForm({ vendor, categories, onDone }: { vendor?: Vendor; categories: Category[]; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({ ...EMPTY, ...(vendor ?? {}), default_category_id: vendor?.default_category_id ?? "" });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const g = v.gstin ? checkGstin(v.gstin) : null;

  const save = () =>
    start(async () => {
      const r = await saveVendor({ ...v, id: vendor?.id, kind: v.kind as "vendor", default_category_id: v.default_category_id || null });
      if (!r.ok) return setMsg(r.message);
      setMsg("");
      if (!vendor) setV(EMPTY);
      onDone?.();
      router.refresh();
    });

  return (
    <Card title={vendor ? "Edit vendor" : "Add a vendor"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Lens Rentals Pvt Ltd" />
        </Field>
        <Field label="Type">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
            <option value="vendor">Vendor / shop</option>
            <option value="freelancer">Freelancer</option>
            <option value="landlord">Landlord</option>
            <option value="software">Software</option>
            <option value="utility">Utility</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Usual category">
          <Select
            value={v.default_category_id}
            onChange={(e) =>
              setV({
                ...v,
                default_category_id: e.target.value,
                tds_nature: v.tds_nature === "none" ? (categories.find((c) => c.id === e.target.value)?.tds_nature ?? "none") : v.tds_nature,
              })
            }
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="GSTIN (if registered)">
          <Input
            value={v.gstin}
            onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase(), state_code: e.target.value.length >= 2 ? e.target.value.slice(0, 2) : v.state_code })}
            placeholder="21ABCDE1234F1Z5"
          />
          {g && !g.ok && <span className="mt-1 block text-xs text-danger">{g.reason}</span>}
          {g?.ok && (
            <a className="mt-1 block text-xs text-navy underline" href={GST_PORTAL_SEARCH} target="_blank" rel="noopener noreferrer">
              Check it on the GST portal
            </a>
          )}
        </Field>
        <Field label="PAN">
          <Input value={v.pan} onChange={(e) => setV({ ...v, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
        </Field>
        <Field label="State">
          <Select value={v.state_code} onChange={(e) => setV({ ...v, state_code: e.target.value })}>
            <option value="">—</option>
            {Object.entries(STATES).map(([code, name]) => (
              <option key={code} value={code}>
                {code} · {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="TDS when paying them">
          <Select value={v.tds_nature} onChange={(e) => setV({ ...v, tds_nature: e.target.value })}>
            {TDS_NATURES.map((n) => (
              <option key={n.code} value={n.code}>
                {n.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email">
          <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="UPI ID">
          <Input value={v.upi_id} onChange={(e) => setV({ ...v, upi_id: e.target.value })} placeholder="name@okbank" />
        </Field>
        <Field label="Bank details" className="sm:col-span-2">
          <Input value={v.bank_details} onChange={(e) => setV({ ...v, bank_details: e.target.value })} placeholder="A/c, IFSC, bank" />
        </Field>
        <Field label="Address" className="sm:col-span-3">
          <Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.msme} onChange={(e) => setV({ ...v, msme: e.target.checked })} />
          MSME (Udyam registered): pay within 45 days
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.is_company} onChange={(e) => setV({ ...v, is_company: e.target.checked })} />
          Company or firm (TDS 2% on contracts)
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={btn.primary} disabled={pending || !v.name.trim()} onClick={save}>
          {vendor ? "Save" : "Add vendor"}
        </button>
        {vendor && (
          <ConfirmButton
            size="md"
            confirm={`Delete ${vendor.name}? Their bills keep the vendor's name.`}
            confirmLabel="Delete vendor"
            onConfirm={() =>
              start(async () => {
                const r = await deleteVendor(vendor.id);
                if (!r.ok) return setMsg(r.message);
                router.push("/vendors");
                router.refresh();
              })
            }
          >
            Delete vendor
          </ConfirmButton>
        )}
        {msg && (
          <p className="text-sm text-danger" role="alert">
            {msg}
          </p>
        )}
      </div>
    </Card>
  );
}
