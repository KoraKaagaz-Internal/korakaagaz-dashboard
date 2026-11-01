"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { button, type ButtonVariant } from "./Button";

/**
 * A button that asks first, inline: "Delete this payment? It can't be undone." + Confirm.
 * Replaces window.confirm and "click again".
 */
export function ConfirmButton({
  children,
  confirm,
  confirmLabel = "Confirm",
  onConfirm,
  variant = "danger",
  size = "sm",
  disabled,
  className = "",
  align = "right",
}: {
  children: ReactNode;
  confirm: ReactNode;
  confirmLabel?: string;
  onConfirm: () => unknown;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        className={`${button(variant, size)} ${className}`}
        disabled={disabled || busy}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label="Confirm"
          className={`absolute top-full z-50 mt-1.5 block w-64 rounded-lg bg-white p-3 text-left text-sm font-normal text-ink shadow-lg ring-1 ring-black/10 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <span className="block">{confirm}</span>
          <span className="mt-3 flex justify-end gap-2">
            <button type="button" className={button("ghost", "sm")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className={button(variant === "danger" ? "dangerSolid" : "primary", "sm")}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  setOpen(false);
                }
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
