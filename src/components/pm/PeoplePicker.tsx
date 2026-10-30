"use client";

import { useEffect, useRef, useState } from "react";
import { displayName, type Person } from "@/lib/pm";
import { Avatar } from "./Avatar";

/** Multi-select of team members in a small popover. Calls onChange when it closes. */
export function PeoplePicker({
  people,
  value,
  onChange,
  label = "Assign",
  disabled,
}: {
  people: Person[];
  value: string[];
  onChange: (emails: string[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(value);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  useEffect(() => setSel(value), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) finish();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  });

  const finish = () => {
    setOpen(false);
    if (dirty.current) {
      dirty.current = false;
      onChange(sel);
    }
  };
  const toggle = (email: string) => {
    dirty.current = true;
    setSel((s) => (s.includes(email) ? s.filter((x) => x !== email) : [...s, email]));
  };
  const shown = people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? finish() : setOpen(true))}
        className="flex min-h-8 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm disabled:bg-neutral-50"
        aria-expanded={open}
      >
        {sel.length ? (
          <span className="flex -space-x-1.5">
            {sel.slice(0, 4).map((e) => (
              <Avatar key={e} email={e} people={people} size={22} />
            ))}
          </span>
        ) : null}
        <span className="sr-only">{label}: </span>
        <span className="text-neutral-600">{sel.length === 1 ? displayName(sel[0], people) : sel.length ? `${sel.length} people` : label}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/10">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="mb-1 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-navy" />
          <ul className="max-h-60 overflow-y-auto">
            {shown.map((p) => (
              <li key={p.email}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50">
                  <input type="checkbox" checked={sel.includes(p.email)} onChange={() => toggle(p.email)} />
                  <Avatar email={p.email} people={people} size={20} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.name || p.email.split("@")[0]}
                    <span className="ml-1 text-xs text-neutral-400 capitalize">{p.role}</span>
                  </span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-2 text-sm text-neutral-500">No one matches.</li>}
          </ul>
          <button type="button" onClick={finish} className="mt-1 w-full rounded-md bg-navy py-1.5 text-sm font-medium text-white">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
