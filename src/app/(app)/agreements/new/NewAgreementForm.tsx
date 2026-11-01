"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAgreement } from "@/app/actions/agreements";
import { Button, Field, Input, Select, Section } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { KIND_LABEL, type AgreementKind } from "@/lib/agreements";

type Opt = { id: string; name: string };

export function NewAgreementForm({
  templates,
  clients,
  projects,
  leads,
  initial,
}: {
  templates: (Opt & { kind: AgreementKind; description: string })[];
  clients: Opt[];
  projects: (Opt & { client_id: string | null })[];
  leads: (Opt & { client_id: string | null })[];
  initial: { template_id: string; client_id: string; project_id: string; lead_id: string };
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...initial, title: "" });
  const [pending, start] = useTransition();
  const shownProjects = projects.filter((p) => !f.client_id || p.client_id === f.client_id);
  return (
    <div className="space-y-8">
      <Section title="1. Template">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...templates, { id: "", name: "Blank", kind: "other" as AgreementKind, description: "Start from an empty page." }].map((t) => (
            <button
              key={t.id || "blank"}
              type="button"
              aria-pressed={f.template_id === t.id}
              onClick={() => setF({ ...f, template_id: t.id })}
              className={`rounded-xl border p-4 text-left ${f.template_id === t.id ? "border-navy ring-1 ring-navy" : "border-line hover:border-neutral-300"}`}
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-neutral-500">{KIND_LABEL[t.kind]}</div>
              <div className="mt-1 text-sm text-neutral-600">{t.description}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="2. Who it's for">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, project_id: "" })}>
              <option value="">None (e.g. a freelancer or model)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
              <option value="">None</option>
              {shownProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead (for proposals)">
            <Select value={f.lead_id} onChange={(e) => setF({ ...f, lead_id: e.target.value })}>
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title (optional)">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Filled from the template" />
          </Field>
        </div>
      </Section>
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createAgreement({
              template_id: f.template_id || null,
              client_id: f.client_id || null,
              project_id: f.project_id || null,
              lead_id: f.lead_id || null,
              title: f.title,
            });
            if (!r.ok) return void toast.error(r.message);
            router.push(`/agreements/${r.id}`);
          })
        }
      >
        {pending ? "Creating…" : "Create draft"}
      </Button>
    </div>
  );
}
