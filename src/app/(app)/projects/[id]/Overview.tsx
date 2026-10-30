"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDeliverable, deletePhase, deleteProject, saveDeliverable, savePhase, setProjectMembers, updateProject } from "@/app/actions/projects";
import { NumberInput } from "@/components/NumberInput";
import { AvatarStack } from "@/components/pm/Avatar";
import { PeoplePicker } from "@/components/pm/PeoplePicker";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { PROJECT_TYPES, displayName, type Person } from "@/lib/pm";
import type { ProjectBundle } from "@/lib/pm-data";
import type { Billing, ProjectFinance } from "@/lib/types";

export function Overview({
  bundle,
  people,
  clients,
  canEdit,
  isAdmin,
}: {
  bundle: ProjectBundle;
  people: Person[];
  clients: { id: string; name: string }[] | null;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { project: p, finance } = bundle;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    client_id: p.client_id ?? "",
    type: p.type,
    description: p.description,
    start_date: p.start_date ?? "",
    due_date: p.due_date ?? "",
    owner_email: p.owner_email ?? "",
    budget_hours: p.budget_hours,
    retainer_hours_month: p.retainer_hours_month,
  });
  const [fin, setFin] = useState<ProjectFinance>(finance ?? { budget: 0, billing: "fixed", hourly_rate: 0, retainer_amount_month: 0 });
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg(r.message ?? "Something went wrong");
      setMsg("");
      after?.();
      router.refresh();
    });

  const totalHours = bundle.tasks.filter((t) => !t.parent_id).reduce((s, t) => s + t.estimate_hours, 0);
  const staffPeople = people.filter((x) => x.role !== "viewer");

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <Card title="About" actions={canEdit && !editing ? <button className={btn.ghost} onClick={() => setEditing(true)}>Edit</button> : undefined}>
          {!editing ? (
            <div className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap text-neutral-700">{p.description || <span className="text-neutral-400">No brief yet.</span>}</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                <Item label="Lead">{p.owner_email ? displayName(p.owner_email, people) : "—"}</Item>
                <Item label="Type">
                  <span className="capitalize">{p.type || "—"}</span>
                </Item>
                <Item label="Start">{formatInvoiceDate(p.start_date) || "—"}</Item>
                <Item label="Due">{formatInvoiceDate(p.due_date) || "—"}</Item>
                <Item label="Estimated">{totalHours ? `${totalHours} h of tasks` : "—"}</Item>
                <Item label="Budget hours">{p.budget_hours ? `${p.budget_hours} h${p.retainer_hours_month ? ` (${p.retainer_hours_month} h/month)` : ""}` : "—"}</Item>
              </dl>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              {clients && (
                <Field label="Client">
                  <Select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                    <option value="">Internal (no client)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Type">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="">—</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lead">
                <Select value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })}>
                  <option value="">—</option>
                  {staffPeople.map((x) => (
                    <option key={x.email} value={x.email}>
                      {x.name || x.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="Due">
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
              <Field label="Budget hours">
                <NumberInput value={form.budget_hours} onValue={(v) => setForm({ ...form, budget_hours: v })} min={0} />
              </Field>
              <Field label="Retainer hours / month">
                <NumberInput value={form.retainer_hours_month} onValue={(v) => setForm({ ...form, retainer_hours_month: v })} min={0} />
              </Field>
              <Field label="Brief" className="sm:col-span-2">
                <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <button className={btn.primary} disabled={pending} onClick={() => run(() => updateProject(p.id, form), () => setEditing(false))}>
                  Save
                </button>
                <button className={btn.secondary} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>

        <Phases bundle={bundle} canEdit={canEdit} run={run} pending={pending} />
        <Deliverables bundle={bundle} canEdit={canEdit} run={run} pending={pending} />
      </div>

      <div className="space-y-5">
        <Card title="Team">
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {bundle.members.map((m) => (
                <li key={m.email} className="flex items-center gap-2">
                  <AvatarStack emails={[m.email]} people={people} />
                  <span className="flex-1">{displayName(m.email, people)}</span>
                  <span className="text-xs text-neutral-400 capitalize">{people.find((x) => x.email === m.email)?.role}</span>
                </li>
              ))}
              {!bundle.members.length && <li className="text-neutral-500">Nobody added yet.</li>}
            </ul>
            {canEdit && (
              <PeoplePicker people={staffPeople} value={bundle.members.map((m) => m.email)} onChange={(emails) => run(() => setProjectMembers(p.id, emails))} label="Change team" />
            )}
          </div>
        </Card>

        {finance && (
          <Card title="Budget">
            {canEdit ? (
              <div className="space-y-3">
                <Field label="Billing">
                  <Select value={fin.billing} onChange={(e) => setFin({ ...fin, billing: e.target.value as Billing })}>
                    <option value="fixed">Fixed fee</option>
                    <option value="hourly">Hourly</option>
                    <option value="retainer">Monthly retainer</option>
                  </Select>
                </Field>
                {fin.billing === "retainer" ? (
                  <Field label="Retainer ₹ / month">
                    <NumberInput value={fin.retainer_amount_month} onValue={(v) => setFin({ ...fin, retainer_amount_month: v })} min={0} />
                  </Field>
                ) : (
                  <Field label={fin.billing === "hourly" ? "Cap (₹)" : "Fee (₹)"}>
                    <NumberInput value={fin.budget} onValue={(v) => setFin({ ...fin, budget: v })} min={0} />
                  </Field>
                )}
                {fin.billing === "hourly" && (
                  <Field label="Rate ₹ / hour">
                    <NumberInput value={fin.hourly_rate} onValue={(v) => setFin({ ...fin, hourly_rate: v })} min={0} />
                  </Field>
                )}
                <button className={btn.secondary} disabled={pending} onClick={() => run(() => updateProject(p.id, {}, fin))}>
                  Save budget
                </button>
              </div>
            ) : (
              <p className="text-sm">
                {finance.billing === "retainer" ? `${formatMoney(finance.retainer_amount_month)} / month` : formatMoney(finance.budget)} · <span className="capitalize">{finance.billing}</span>
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-500">Only staff see money. Freelancers on the project don&apos;t.</p>
          </Card>
        )}

        {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}

        {isAdmin && (
          <div>
            <button
              className={btn.danger}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                start(async () => {
                  const r = await deleteProject(p.id);
                  if (!r.ok) return setMsg(r.message);
                  router.push("/projects");
                });
              }}
            >
              {confirmDelete ? "Click again to delete the project, its tasks and files" : "Delete project"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => void;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{children}</dd>
    </div>
  );
}

function Phases({ bundle, canEdit, run, pending }: { bundle: ProjectBundle; canEdit: boolean; run: Run; pending: boolean }) {
  const [name, setName] = useState("");
  return (
    <Card title="Phases">
      <ol className="space-y-1.5 text-sm">
        {bundle.phases.map((ph, i) => {
          const tasks = bundle.tasks.filter((t) => t.phase_id === ph.id && !t.parent_id);
          const done = tasks.filter((t) => t.status === "done").length;
          return (
            <li key={ph.id} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs text-neutral-400">{i + 1}</span>
              <span className={`flex-1 ${tasks.length && done === tasks.length ? "text-neutral-400 line-through" : ""}`}>{ph.name}</span>
              <span className="text-xs text-neutral-500">
                {done}/{tasks.length}
                {ph.due_date ? ` · ${formatInvoiceDate(ph.due_date).replace(/, \d{4}$/, "")}` : ""}
              </span>
              {canEdit && (
                <button className="text-xs text-neutral-400 hover:text-red-600" disabled={pending} onClick={() => run(() => deletePhase(ph.id, ph.project_id))} aria-label={`Remove phase ${ph.name}`}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
        {!bundle.phases.length && <li className="text-neutral-500">No phases. Tasks still work without them.</li>}
      </ol>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New phase" aria-label="New phase name" />
          <button className={btn.secondary} disabled={!name.trim() || pending} onClick={() => run(() => savePhase({ project_id: bundle.project.id, name, sort: bundle.phases.length }), () => setName(""))}>
            Add
          </button>
        </div>
      )}
    </Card>
  );
}

function Deliverables({ bundle, canEdit, run, pending }: { bundle: ProjectBundle; canEdit: boolean; run: Run; pending: boolean }) {
  const [d, setD] = useState({ name: "", qty: 1, revision_limit: 2 });
  return (
    <Card title="Deliverables">
      {bundle.deliverables.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Deliverable</th>
              <th className="font-medium">Qty</th>
              <th className="font-medium">Revisions</th>
              <th className="font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {bundle.deliverables.map((x) => (
              <tr key={x.id}>
                <td className="py-1.5">{x.name}</td>
                <td className="tabular-nums">{x.qty}</td>
                <td className="tabular-nums">{x.revision_limit} rounds</td>
                <td>
                  {canEdit ? (
                    <select
                      className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs"
                      value={x.status}
                      onChange={(e) => run(() => saveDeliverable({ ...x, status: e.target.value as typeof x.status }))}
                      aria-label={`Status of ${x.name}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="delivered">Delivered</option>
                    </select>
                  ) : (
                    <span className="text-xs capitalize">{x.status.replace("_", " ")}</span>
                  )}
                </td>
                <td className="text-right">
                  {canEdit && (
                    <button className="text-xs text-neutral-400 hover:text-red-600" disabled={pending} onClick={() => run(() => deleteDeliverable(x.id, x.project_id))} aria-label={`Remove ${x.name}`}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-neutral-500">List what the client gets, with how many revision rounds are included.</p>
      )}
      {canEdit && (
        <div className="mt-3 grid grid-cols-[1fr_70px_90px_auto] gap-2">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Edited images" aria-label="Deliverable name" />
          <NumberInput value={d.qty} onValue={(v) => setD({ ...d, qty: v })} min={1} aria-label="Quantity" />
          <NumberInput value={d.revision_limit} onValue={(v) => setD({ ...d, revision_limit: v })} min={0} aria-label="Revision rounds" />
          <button
            className={btn.secondary}
            disabled={!d.name.trim() || pending}
            onClick={() => run(() => saveDeliverable({ project_id: bundle.project.id, ...d }), () => setD({ name: "", qty: 1, revision_limit: 2 }))}
          >
            Add
          </button>
        </div>
      )}
    </Card>
  );
}
