"use client";

import { useActionState } from "react";
import { sendMagicLink } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-navy"
      />
      <button
        disabled={pending}
        className="w-full rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      {state && <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}
