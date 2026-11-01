"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveLead } from "@/app/actions/crm";
import { NumberInput } from "@/components/NumberInput";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { SOURCES, STAGES, type Lead } from "@/lib/crm";
import type { Person } from "@/lib/pm";

export function LeadForm({ lead, people, services, me, onDone }: { lead?: Lead; people: Person[]; services: string[]; me: string; onDone?: () => void }) {
  const router = useRouter();
  const [l, setL] = useState({
    name: lead?.name ?? "",
    company: lead?.company ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    city: lead?.city ?? "",
    source: lead?.source ?? ("referral" as Lead["source"]),
    service: lead?.service ?? "",
    budget: lead?.budget ?? "",
    value: lead?.value ?? 0,
    stage: lead?.stage ?? ("enquiry" as Lead["stage"]),
    owner_email: lead?.owner_email ?? me,
    follow_up_on: lead?.follow_up_on ?? "",
    message: lead?.message ?? "",
    notes: lead?.notes ?? "",
  });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await saveLead({ ...l, id: lead?.id });
      if (!r.ok) return setMsg(r.message);
      if (onDone) onDone();
      else router.push(`/crm/${r.id}`);
      router.refresh();
    });
  return (
    <Card title={lead ? "Edit lead" : undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="Riya Sen" autoFocus={!lead} />
        </Field>
        <Field label="Company / brand">
          <Input value={l.company} onChange={(e) => setL({ ...l, company: e.target.value })} placeholder="Acme Foods" />
        </Field>
        <Field label="Email">
          <Input type="email" value={l.email} onChange={(e) => setL({ ...l, email: e.target.value })} />
        </Field>
        <Field label="Phone / WhatsApp">
          <Input value={l.phone} onChange={(e) => setL({ ...l, phone: e.target.value })} />
        </Field>
        <Field label="Where they came from">
          <Select value={l.source} onChange={(e) => setL({ ...l, source: e.target.value as Lead["source"] })}>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What they need">
          <Input value={l.service} onChange={(e) => setL({ ...l, service: e.target.value })} list="lead-services" placeholder="Brand identity" />
          <datalist id="lead-services">
            {services.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Their budget (as they said it)">
          <Input value={l.budget} onChange={(e) => setL({ ...l, budget: e.target.value })} placeholder="₹50k–1L" />
        </Field>
        <Field label="Deal value estimate (₹)">
          <NumberInput value={l.value} onValue={(v) => setL({ ...l, value: v })} min={0} />
        </Field>
        <Field label="Stage">
          <Select value={l.stage} onChange={(e) => setL({ ...l, stage: e.target.value as Lead["stage"] })}>
            {STAGES.filter((s) => s.key !== "lost" || lead?.stage === "lost").map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={l.owner_email ?? ""} onChange={(e) => setL({ ...l, owner_email: e.target.value })}>
            {people
              .filter((p) => p.role === "admin" || p.role === "member")
              .map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name || p.email}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Follow up on">
          <Input type="date" value={l.follow_up_on ?? ""} onChange={(e) => setL({ ...l, follow_up_on: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={l.city} onChange={(e) => setL({ ...l, city: e.target.value })} />
        </Field>
        <Field label="What they asked for" className="sm:col-span-2">
          <Textarea rows={3} value={l.message} onChange={(e) => setL({ ...l, message: e.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={l.notes} onChange={(e) => setL({ ...l, notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className={btn.primary} disabled={pending || !l.name.trim()} onClick={submit}>
          {lead ? "Save" : "Add lead"}
        </button>
        {onDone && (
          <button className={btn.secondary} onClick={onDone}>
            Cancel
          </button>
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
