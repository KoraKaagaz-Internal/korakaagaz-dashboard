import Link from "next/link";
import type { ReactNode } from "react";

/** The one page header: optional back link, title, one-line subtitle, actions, and tabs underneath. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  tabs,
  meta,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  tabs?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className={`mb-6 ${tabs ? "" : "border-b border-line pb-4"}`}>
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-navy">
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </header>
  );
}

/** A titled section without a card: heading + hairline, for calm pages. */
export function Section({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
