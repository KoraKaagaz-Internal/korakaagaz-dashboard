"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

type Toast = { id: number; kind: "success" | "error"; text: string };
let listeners: ((t: Toast) => void)[] = [];
let seq = 0;
const emit = (kind: Toast["kind"], text: string) => listeners.forEach((l) => l({ id: ++seq, kind, text }));

/** Show a short message at the bottom of the screen. Works from any client component. */
export const toast = {
  success: (text: string) => emit("success", text),
  error: (text: string) => emit("error", text),
};

/** One place for feedback. Mounted once in the app layout. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setItems((x) => [...x.slice(-2), t]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), t.kind === "error" ? 7000 : 3500);
    };
    listeners.push(on);
    return () => {
      listeners = listeners.filter((l) => l !== on);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite" role="status">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg ring-1 [animation:toast-in_.18s_ease-out] ${t.kind === "error" ? "bg-white text-danger ring-danger/30" : "bg-ink text-white ring-black/10"}`}
        >
          <span aria-hidden>{t.kind === "error" ? "⚠" : "✓"}</span>
          <span className="min-w-0 flex-1">{t.text}</span>
          <button type="button" className="ml-2 opacity-60 hover:opacity-100" aria-label="Dismiss" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

type ActionResult = { ok: boolean; message?: string } | void | undefined;

/**
 * Wraps a server action: shows a pending state, toasts the error (or a success message),
 * and refreshes the page data on success.
 */
export function useAction<A extends unknown[], R extends ActionResult>(fn: (...args: A) => Promise<R>, opts: { success?: string | ((r: R) => string); refresh?: boolean } = {}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { success, refresh = true } = opts;
  const run = useCallback(
    (...args: A) =>
      new Promise<R | undefined>((resolve) =>
        start(async () => {
          try {
            const r = await fn(...args);
            if (r && r.ok === false) {
              toast.error(r.message || "Something went wrong");
              return resolve(r);
            }
            if (success) toast.success(typeof success === "function" ? success(r) : success);
            if (refresh) router.refresh();
            resolve(r);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong");
            resolve(undefined);
          }
        }),
      ),
    [fn, success, refresh, router],
  );
  return [run, pending] as const;
}
