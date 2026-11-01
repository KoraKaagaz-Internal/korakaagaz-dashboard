"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCategory } from "@/app/actions/expenses";
import { NumberInput } from "@/components/NumberInput";
import { Card, Input, Select, btn } from "@/components/ui";
import type { Category } from "@/lib/expense-data";
import { TDS_NATURES } from "@/lib/expenses";

export function CategoryEditor({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(categories);
  const [add, setAdd] = useState("");
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<Category>) => setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const save = (c: Pick<Category, "name" | "itc_rule" | "kind" | "tds_nature" | "rcm" | "budget_month" | "active"> & { id?: string }) =>
    start(async () => {
      const r = await saveCategory(c);
      if (!r.ok) return setMsg(r.message);
      setMsg("");
      setSaved(c.id ?? "new");
      if (!c.id) setAdd("");
      router.refresh();
    });
  return (
    <Card>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Category</th>
              <th className="font-medium">GST credit</th>
              <th className="font-medium">Kind</th>
              <th className="font-medium">TDS</th>
              <th className="font-medium">Reverse charge</th>
              <th className="font-medium">Budget / month</th>
              <th className="font-medium">In use</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="py-1.5 pr-2">
                  <Input value={c.name} onChange={(e) => set(c.id, { name: e.target.value })} aria-label="Name" />
                </td>
                <td className="pr-2">
                  <Select value={c.itc_rule} onChange={(e) => set(c.id, { itc_rule: e.target.value as Category["itc_rule"] })} aria-label={`GST credit for ${c.name}`}>
                    <option value="eligible">Claimable</option>
                    <option value="blocked">Blocked (17(5))</option>
                    <option value="none">No GST</option>
                  </Select>
                </td>
                <td className="pr-2">
                  <Select value={c.kind} onChange={(e) => set(c.id, { kind: e.target.value as Category["kind"] })} aria-label={`Kind of ${c.name}`}>
                    <option value="overhead">Studio overhead</option>
                    <option value="pass_through">Project cost</option>
                  </Select>
                </td>
                <td className="pr-2">
                  <Select value={c.tds_nature} onChange={(e) => set(c.id, { tds_nature: e.target.value })} aria-label={`TDS for ${c.name}`}>
                    {TDS_NATURES.map((n) => (
                      <option key={n.code} value={n.code}>
                        {n.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={c.rcm} onChange={(e) => set(c.id, { rcm: e.target.checked })} aria-label={`Reverse charge for ${c.name}`} />
                </td>
                <td className="pr-2">
                  <NumberInput className="!w-28" value={c.budget_month} onValue={(v) => set(c.id, { budget_month: v })} min={0} aria-label={`Budget for ${c.name}`} />
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={c.active} onChange={(e) => set(c.id, { active: e.target.checked })} aria-label={`${c.name} in use`} />
                </td>
                <td>
                  <button className={btn.ghost} disabled={pending} onClick={() => save(c)}>
                    {saved === c.id ? "Saved" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        <Input className="!w-64" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="New category" aria-label="New category" />
        <button
          className={btn.secondary}
          disabled={!add.trim() || pending}
          onClick={() => save({ name: add, itc_rule: "eligible", kind: "overhead", tds_nature: "none", rcm: false, budget_month: 0, active: true })}
        >
          Add
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {msg}
        </p>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Project costs (freelancers, props, studio hire) are what you pass through to clients; they come off revenue to give your agency gross income in Reports. Budgets show as
        budget-vs-actual bars.
      </p>
    </Card>
  );
}
