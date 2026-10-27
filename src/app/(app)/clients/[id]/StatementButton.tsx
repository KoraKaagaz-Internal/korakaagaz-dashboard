"use client";

import { useState, useTransition } from "react";
import { sendStatement } from "@/app/actions/send";
import { btn } from "@/components/ui";

export function StatementButton({ clientId, disabled }: { clientId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-2">
      <button
        className={btn.secondary}
        disabled={pending || disabled}
        title={disabled ? "Nothing outstanding" : "Email one summary of all unpaid invoices"}
        onClick={() => start(async () => setMsg((await sendStatement(clientId)).message))}
      >
        {pending ? "Sending…" : "Email statement"}
      </button>
      {msg && <span className="max-w-60 text-xs text-neutral-600">{msg}</span>}
    </span>
  );
}
