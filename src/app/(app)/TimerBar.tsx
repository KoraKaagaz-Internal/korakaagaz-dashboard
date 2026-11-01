"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { stopTimer } from "@/app/actions/time";
import { hhmm } from "@/lib/time";

/** Running timer in the header: elapsed time and a Stop button. */
export function TimerBar({ timer }: { timer: { started: string; project_id: string; project_code: string; task_title: string } | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  const mins = Math.max(0, Math.floor((now - Date.parse(timer.started)) / 60000));
  return (
    <div className="flex items-center gap-2 rounded-full bg-danger/5 py-1 pr-1 pl-3 text-sm ring-1 ring-danger/20" role="status" aria-live="polite">
      <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
      <Link href={`/projects/${timer.project_id}`} className="hidden max-w-48 truncate text-red-900 hover:underline sm:inline" title={timer.task_title || timer.project_code}>
        {timer.project_code}
        {timer.task_title ? ` · ${timer.task_title}` : ""}
      </Link>
      <span className="font-mono text-red-900 tabular-nums">{hhmm(mins)}</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await stopTimer();
            router.refresh();
          })
        }
        className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-medium text-white hover:bg-red-700"
      >
        Stop
      </button>
    </div>
  );
}
