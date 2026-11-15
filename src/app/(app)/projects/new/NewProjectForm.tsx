"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClientForm } from "@/components/ClientForm";
import { createProject, saveSplit } from "@/app/actions/projects";
import { NumberInput } from "@/components/NumberInput";
import { PeoplePicker } from "@/components/pm/PeoplePicker";
import { SplitInput } from "@/components/pm/SplitInput";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { PROJECT_TYPES, type Person } from "@/lib/pm";
import type { Billing } from "@/lib/types";
import { navigate } from "@/lib/navigate";

interface Tpl {
  id: string;
  name: string;
  description: string;
  billing: Billing;
  task_count: number;
  type: string;
}

export function NewProjectForm({
  templates,
  clients: initialClients,
  people,
  me,
  today,
  clientId,
  isAdmin,
}: {
  templates: Tpl[];
  clients: { id: string; name: string }[];
  people: Person[];
  me: string;
  today: string;
  clientId: string;
  /** The fee, retainer amount and team split are the admin's. */
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tpl, setTpl] = useState<string>("");
  const [p, setP] = useState({
    name: "",
    client_id: clientId,
    type: "",
    description: "",
    start_date: today,
    due_date: "",
    owner_email: me,
  });
  // NaN = an empty box; a pre-filled 0 turns a typed 36904 into 369040
  const [fin, setFin] = useState({
    budget: NaN,
    billing: "fixed" as Billing,
    retainer_amount_month: NaN,
  });
  const [members, setMembers] = useState<string[]>([me]);
  const [splits, setSplits] = useState<{ name: string; amount: number }[]>([]);
  const [clients, setClients] = useState(initialClients);
  const [addingClient, setAddingClient] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const pick = (t: Tpl | null) => {
    setTpl(t?.id ?? "");
    if (t) {
      setP((x) => ({ ...x, type: t.type }));
      setFin((f) => ({ ...f, billing: t.billing }));
    }
  };

  const submit = () =>
    start(async () => {
      setMsg("");
      const r = await createProject({
        project: { ...p, status: "active" },
        finance: { ...fin, budget: fin.budget || 0, retainer_amount_month: fin.retainer_amount_month || 0 },
        template_id: tpl || null,
        members,
      });
      if (!r.ok) return setMsg(r.message);
      for (const s of splits) {
        const sr = await saveSplit({ project_id: r.id, ...s });
        if (!sr.ok) return setMsg(`Project created, but a team split failed: ${sr.message}`);
      }
      navigate(router, splits.length ? `/projects/${r.id}?tab=money` : `/projects/${r.id}`);
    });

  return (
    <div className="space-y-5">
      <Card title="1. Start from">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[null, ...templates].map((t) => {
            const selected = (t?.id ?? "") === tpl;
            return (
              <button
                key={t?.id ?? "blank"}
                type="button"
                onClick={() => pick(t)}
                aria-pressed={selected}
                className={`rounded-xl p-3 text-left ring-1 transition ${selected ? "bg-navy/5 ring-2 ring-navy" : "ring-black/10 hover:ring-navy/40"}`}
              >
                <div className="font-medium">
                  {t ? t.name : "Blank project"}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {t ? t.description : "No tasks; add your own."}
                </div>
                {t && (
                  <div className="mt-2 text-xs text-neutral-400">
                    {t.task_count} tasks{t.billing === "retainer" ? " · monthly retainer" : ""}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="2. Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project name">
            <Input
              value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })}
              placeholder="Acme rebrand"
              autoFocus
            />
          </Field>
          <Field label="Client">
            <Select
              value={p.client_id}
              onChange={(e) =>
                e.target.value === "__new"
                  ? setAddingClient(true)
                  : setP({ ...p, client_id: e.target.value })
              }
            >
              <option value="">Internal (no client)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New client…</option>
            </Select>
          </Field>
          {addingClient && (
            <div className="rounded-xl border border-line p-4 sm:col-span-2">
              <ClientForm
                onCancel={() => setAddingClient(false)}
                onSaved={(c) => {
                  setClients((l) =>
                    [...l, { id: c.id, name: c.name }].sort((a, b) =>
                      a.name.localeCompare(b.name),
                    ),
                  );
                  setP((x) => ({ ...x, client_id: c.id }));
                  setAddingClient(false);
                }}
              />
            </div>
          )}
          <Field label="Type">
            <Select
              value={p.type}
              onChange={(e) => setP({ ...p, type: e.target.value })}
            >
              <option value="">—</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead">
            <Select
              value={p.owner_email}
              onChange={(e) => setP({ ...p, owner_email: e.target.value })}
            >
              {people
                .filter((x) => x.role !== "viewer")
                .map((x) => (
                  <option key={x.email} value={x.email}>
                    {x.name || x.email}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Start">
            <Input
              type="date"
              value={p.start_date}
              onChange={(e) => setP({ ...p, start_date: e.target.value })}
            />
          </Field>
          <Field label="Due (blank = from template)">
            <Input
              type="date"
              value={p.due_date}
              onChange={(e) => setP({ ...p, due_date: e.target.value })}
            />
          </Field>
          <Field label="Brief" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={p.description}
              onChange={(e) => setP({ ...p, description: e.target.value })}
              placeholder="What we're making, for whom, and what done looks like."
            />
          </Field>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Team on this project
            </span>
            <PeoplePicker
              people={people.filter((x) => x.role !== "viewer")}
              value={members}
              onChange={setMembers}
              label="Add people"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Freelancers only see projects they&apos;re added to.
            </p>
          </div>
        </div>
      </Card>

      <Card title={isAdmin ? "3. Fee and team split" : "3. Billing"}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Billing">
            <Select value={fin.billing} onChange={(e) => setFin({ ...fin, billing: e.target.value as Billing })}>
              <option value="fixed">Fixed fee</option>
              <option value="retainer">Monthly retainer</option>
            </Select>
          </Field>
          {isAdmin &&
            (fin.billing === "retainer" ? (
              <Field label="Retainer ₹ / month">
                <NumberInput value={fin.retainer_amount_month} onValue={(v) => setFin({ ...fin, retainer_amount_month: v })} min={0} />
              </Field>
            ) : (
              <Field label="Fee (₹)">
                <NumberInput value={fin.budget} onValue={(v) => setFin({ ...fin, budget: v })} min={0} />
              </Field>
            ))}
        </div>
        {isAdmin && (
          <div className="mt-4 space-y-2">
            <span className="block text-xs font-medium tracking-wide text-neutral-500 uppercase">Team split (optional)</span>
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{s.name}</span>
                <span className="tabular-nums">{formatMoney(s.amount)}</span>
                <button type="button" className="text-xs text-neutral-400 hover:text-danger" onClick={() => setSplits(splits.filter((_, k) => k !== i))} aria-label={`Remove ${s.name}`}>
                  Remove
                </button>
              </div>
            ))}
            <SplitInput people={people.filter((x) => x.email !== me)} fee={(fin.billing === "retainer" ? fin.retainer_amount_month : fin.budget) || 0} onAdd={(s) => setSplits([...splits, s])} />
            <p className="text-xs text-neutral-500">What you&apos;ll pay each person for this project. Mark it paid later from the project&apos;s Money tab.</p>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={pending || !p.name.trim()}
          onClick={submit}
        >
          {pending ? "Creating…" : "Create project"}
        </button>
        {msg && (
          <p className="text-sm text-danger" role="alert">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
