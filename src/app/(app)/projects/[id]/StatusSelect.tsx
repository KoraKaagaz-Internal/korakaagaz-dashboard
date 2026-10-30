"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateProject } from "@/app/actions/projects";
import { PROJECT_STATUSES } from "@/lib/pm";
import type { ProjectStatus } from "@/lib/types";

export function StatusSelect({ id, status, disabled }: { id: string; status: ProjectStatus; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={status}
      disabled={disabled || pending}
      aria-label="Project status"
      onChange={(e) =>
        start(async () => {
          await updateProject(id, { status: e.target.value as ProjectStatus });
          router.refresh();
        })
      }
      className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm"
    >
      {PROJECT_STATUSES.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
