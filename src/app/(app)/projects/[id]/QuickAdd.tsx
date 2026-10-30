"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTask } from "@/app/actions/projects";
import type { TaskStatus } from "@/lib/pm";

/** One-line task creation: type a title, press Enter. */
export function QuickAdd({ projectId, status = "todo", phaseId = null, parentId = null, placeholder = "Add a task" }: { projectId: string; status?: TaskStatus; phaseId?: string | null; parentId?: string | null; placeholder?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      if (!title.trim()) return setOpen(false);
      const r = await createTask(projectId, { title, status, phase_id: phaseId, parent_id: parentId });
      if (!r.ok) return setMsg(r.message);
      setTitle("");
      setMsg("");
      router.refresh();
    });

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg px-2 py-1.5 text-left text-sm text-neutral-500 hover:bg-white hover:text-neutral-800">
        + {placeholder}
      </button>
    );
  return (
    <div>
      <input
        autoFocus
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        placeholder={`${placeholder}, then Enter`}
        aria-label={placeholder}
        className="w-full rounded-lg border border-navy/40 bg-white px-2.5 py-1.5 text-sm outline-none"
      />
      {msg && <p className="mt-1 text-xs text-red-700">{msg}</p>}
    </div>
  );
}
