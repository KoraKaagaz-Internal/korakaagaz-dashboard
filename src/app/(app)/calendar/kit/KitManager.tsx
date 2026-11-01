"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteKit, saveKit } from "@/app/actions/calendar";
import { Card, ConfirmButton, Input, btn } from "@/components/ui";
import type { KitItem } from "@/lib/time-data";

const SUGGESTED = ["Camera", "Lens", "Lighting", "Grip", "Audio", "Backdrop", "Props", "Computer"];

export function KitManager({ kit }: { kit: KitItem[] }) {
  const router = useRouter();
  const [k, setK] = useState({ name: "", category: "Camera", serial: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg(r.message ?? "Something went wrong");
      setMsg("");
      after?.();
      router.refresh();
    });
  const categories = [...new Set([...kit.map((x) => x.category || "Other")])];
  return (
    <div className="space-y-5">
      <Card title="Add kit">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} placeholder="Sony A7 IV" aria-label="Name" />
          <Input value={k.category} onChange={(e) => setK({ ...k, category: e.target.value })} list="kit-cats" placeholder="Category" aria-label="Category" />
          <Input value={k.serial} onChange={(e) => setK({ ...k, serial: e.target.value })} placeholder="Serial (optional)" aria-label="Serial" />
          <button
            className={btn.primary}
            disabled={!k.name.trim() || pending}
            onClick={() =>
              run(
                () => saveKit(k),
                () => setK({ ...k, name: "", serial: "" }),
              )
            }
          >
            Add
          </button>
          <datalist id="kit-cats">
            {[...new Set([...SUGGESTED, ...categories])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {msg && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {msg}
          </p>
        )}
      </Card>
      {categories.map((c) => (
        <Card key={c} title={c}>
          <ul className="divide-y divide-neutral-100 text-sm">
            {kit
              .filter((x) => (x.category || "Other") === c)
              .map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2">
                  <span className={`flex-1 ${x.active ? "" : "text-neutral-400 line-through"}`}>
                    {x.name}
                    {x.serial && <span className="ml-2 text-xs text-neutral-400">{x.serial}</span>}
                  </span>
                  <button className={btn.ghost} onClick={() => run(() => saveKit({ ...x, active: !x.active }))}>
                    {x.active ? "Retire" : "Bring back"}
                  </button>
                  <ConfirmButton
                    confirm={`Delete ${x.name}? Past bookings lose it. Use Retire to keep history.`}
                    confirmLabel="Delete"
                    onConfirm={() => run(() => deleteKit(x.id))}
                  >
                    Delete
                  </ConfirmButton>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
