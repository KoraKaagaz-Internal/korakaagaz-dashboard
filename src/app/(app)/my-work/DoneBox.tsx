"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateTask } from "@/app/actions/projects";

export function DoneBox({ id, title, done, disabled }: { id: string; title: string; done: boolean; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      className="size-4"
      checked={done}
      disabled={disabled || pending}
      aria-label={`Mark ${title} ${done ? "not done" : "done"}`}
      onChange={() =>
        start(async () => {
          await updateTask(id, { status: done ? "todo" : "done" });
          router.refresh();
        })
      }
    />
  );
}
