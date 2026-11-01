import type { ComponentProps, ReactNode } from "react";
import { button } from "./ui/Button";

export { Button, ButtonLink, button, type ButtonVariant } from "./ui/Button";
export { ConfirmButton } from "./ui/ConfirmButton";
export { DataList, type Column, type DataRow } from "./ui/DataList";
export { Badge, EmptyState, InfoTip, Stat, StatRow, type Tone } from "./ui/Feedback";
export { FilterBar } from "./ui/FilterBar";
export { PageHeader, Section } from "./ui/PageHeader";
export { Segmented, Tabs, type TabItem } from "./ui/Tabs";

export const inputCls = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy disabled:bg-subtle";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={2} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-white p-5">
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

/** Class strings for places that style their own <button>/<Link>; prefer <Button>/<ButtonLink>. */
export const btn = {
  primary: button("primary", "md"),
  secondary: button("secondary", "md"),
  ghost: button("ghost", "sm"),
  danger: button("danger", "sm"),
};

export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-subtle text-neutral-600",
  awaiting_approval: "bg-warn/10 text-warn",
  issued: "bg-navy/8 text-navy",
  accepted: "bg-ok/10 text-ok",
  declined: "bg-subtle text-neutral-500",
  expired: "bg-subtle text-neutral-500",
  cancelled: "bg-subtle text-neutral-400 line-through",
  unpaid: "bg-warn/10 text-warn",
  partial: "bg-accent/10 text-accent",
  paid: "bg-ok/10 text-ok",
  overdue: "bg-danger/10 text-danger",
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
