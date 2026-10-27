"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProject } from "@/app/actions/catalog";
import { Card, Field, Input, Select, btn } from "@/components/ui";
import type { Project } from "@/lib/types";

export function ProjectForm({ clients, project }: { clients: { id: string; name: string }[]; project?: Project }) {
  const router = useRouter();
  const [p, setP] = useState({ client_id: project?.client_id ?? "", name: project?.name ?? "", budget: project?.budget ?? 0, status: project?.status ?? ("active" as const) });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card title={project ? "Edit project" : "New project"}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_120px_auto] sm:items-end">
        <Field label="Client">
          <Select value={p.client_id} onChange={(e) => setP({ ...p, client_id: e.target.value })}>
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Website redesign" />
        </Field>
        <Field label="Budget (₹)">
          <Input type="number" min={0} value={p.budget} onChange={(e) => setP({ ...p, budget: e.target.valueAsNumber || 0 })} />
        </Field>
        <Field label="Status">
          <Select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value as "active" | "closed" })}>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveProject({ ...p, id: project?.id });
              if (!r.ok) return setMsg(r.message);
              setMsg("");
              if (!project) setP({ client_id: "", name: "", budget: 0, status: "active" });
              router.refresh();
            })
          }
        >
          Save
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </Card>
  );
}
