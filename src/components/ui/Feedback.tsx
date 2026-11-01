import type { ReactNode } from "react";

/** Empty lists: say what's missing and what to do. `filtered` = nothing matches the filters. */
export function EmptyState({ title, hint, action, filtered }: { title: string; hint?: ReactNode; action?: ReactNode; filtered?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
      {filtered && !action && <p className="mt-1 text-xs text-neutral-400">Try clearing the filters.</p>}
    </div>
  );
}

const TONES = {
  neutral: "bg-subtle text-neutral-700",
  navy: "bg-navy/8 text-navy",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}

/** One key number: label, value, a short line under it. */
export function Stat({ label, value, sub, tone, info }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "danger" | "ok" | "warn"; info?: ReactNode }) {
  const color = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs text-neutral-500">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className={`mt-0.5 truncate text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

/** A row of key numbers separated by hairlines (calmer than a row of cards). */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-3 lg:grid-cols-5">{children}</div>;
}

/** ⓘ with a plain-English explanation on hover or keyboard focus. */
export function InfoTip({ children, label = "What does this mean?" }: { children: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none text-neutral-400 ring-1 ring-neutral-300 hover:text-navy hover:ring-navy"
      >
        i
      </button>
      <span
        role="tooltip"
        className="absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-snug font-normal text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}
