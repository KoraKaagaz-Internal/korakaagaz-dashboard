"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTimeApproval } from "@/app/actions/settings";
import { Card } from "@/components/ui";

export function TimeApproval({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card title="Timesheets">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            start(async () => {
              const r = await setTimeApproval(next);
              if (!r.ok) {
                setValue(!next);
                return setMsg(r.message);
              }
              setMsg("");
              router.refresh();
            });
          }}
        />
        <span>
          <span className="font-medium">Ask people to submit their week for approval</span>
          <span className="block text-neutral-500">Off: hours count as soon as they&apos;re logged.</span>
        </span>
      </label>
      {msg && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {msg}
        </p>
      )}
    </Card>
  );
}
