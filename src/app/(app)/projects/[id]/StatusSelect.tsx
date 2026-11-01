"use client";

import { updateProject } from "@/app/actions/projects";
import { inputCls } from "@/components/ui";
import { useAction } from "@/components/ui/Toaster";
import { PROJECT_STATUSES } from "@/lib/pm";
import type { ProjectStatus } from "@/lib/types";

export function StatusSelect({ id, status, disabled }: { id: string; status: ProjectStatus; disabled: boolean }) {
  const [run, pending] = useAction(updateProject, { success: "Status updated" });
  return (
    <select
      value={status}
      disabled={disabled || pending}
      aria-label="Project status"
      onChange={(e) => run(id, { status: e.target.value as ProjectStatus })}
      className={`${inputCls} !w-auto !py-1`}
    >
      {PROJECT_STATUSES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
