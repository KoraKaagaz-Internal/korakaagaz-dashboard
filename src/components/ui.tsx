import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-navy disabled:bg-neutral-50";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const btn = {
  primary: "rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-60",
  secondary:
    "rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-60",
  ghost: "rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-60",
  danger: "rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60",
};

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  awaiting_approval: "bg-violet-100 text-violet-800",
  issued: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-neutral-200 text-neutral-700",
  expired: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-neutral-200 text-neutral-500 line-through",
  unpaid: "bg-amber-100 text-amber-800",
  partial: "bg-sky-100 text-sky-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
};

const STATUS_TEXT: Record<string, string> = {
  awaiting_approval: "Needs approval",
  issued: "Issued",
  partial: "Part paid",
};

/** Status pill with a text label (never colour alone). */
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {STATUS_TEXT[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** The most useful single status for a document: overdue > payment status > lifecycle status. */
export function displayStatus(d: { status: string; balance: { payment_status: string | null; overdue: boolean } | null }): string {
  if (d.status === "issued" && d.balance?.overdue) return "overdue";
  if (d.status === "issued" && d.balance?.payment_status) return d.balance.payment_status;
  return d.status;
}
