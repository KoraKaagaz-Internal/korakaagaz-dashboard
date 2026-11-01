"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCapacity } from "@/app/actions/time";
import { NumberInput } from "@/components/NumberInput";
import { Card, btn } from "@/components/ui";
import type { Capacity } from "@/lib/time-data";

/** Admin: weekly hours per person, for the workload view and team utilisation. */
export function CapacityEditor({ people }: { people: Capacity[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(people);
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card title="Weekly hours">
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.email} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate">
              {r.name || r.email}
              <span className="ml-1 text-xs text-neutral-400 capitalize">{r.role}</span>
            </span>
            <NumberInput
              className="!w-20"
              value={r.weekly_capacity_hours}
              onValue={(v) => setRows((x) => x.map((p) => (p.email === r.email ? { ...p, weekly_capacity_hours: v } : p)))}
              min={0}
              max={80}
              aria-label={`Weekly hours for ${r.email}`}
            />
            <span className="text-xs text-neutral-500">h / week</span>
            <button
              className={btn.ghost}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setCapacity(r.email, r.weekly_capacity_hours);
                  if (!res.ok) return setMsg(res.message);
                  setMsg("");
                  setSaved(r.email);
                  router.refresh();
                })
              }
            >
              {saved === r.email ? "Saved" : "Save"}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-neutral-500">Used by Workload and the team hours chart in Reports.</p>
      {msg && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {msg}
        </p>
      )}
    </Card>
  );
}
