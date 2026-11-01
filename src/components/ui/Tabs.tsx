import Link from "next/link";
import type { ReactNode } from "react";

export interface TabItem {
  href: string;
  label: ReactNode;
  active: boolean;
  count?: number;
}

/** Route-based underline tabs (scroll sideways on small screens). */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-1">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${t.active ? "border-navy font-medium text-navy" : "border-transparent text-neutral-600 hover:text-ink"}`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-subtle px-1.5 text-xs text-neutral-600 tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A small pill switch between views of the same thing (Board / List, Month / Week). */
export function Segmented({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg bg-subtle p-0.5">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`rounded-md px-3 py-1 text-sm whitespace-nowrap ${t.active ? "bg-white font-medium text-ink shadow-sm" : "text-neutral-600 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
