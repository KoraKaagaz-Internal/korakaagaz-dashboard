import Link from "next/link";

const TABS = [
  { href: "/expenses", label: "All expenses" },
  { href: "/expenses?show=unpaid", label: "Bills to pay" },
  { href: "/expenses/claims", label: "Team claims" },
  { href: "/expenses/gst", label: "GST & TDS" },
  { href: "/vendors", label: "Vendors" },
];

export function ExpenseTabs({ current, isAdmin }: { current: string; isAdmin: boolean }) {
  const tabs = isAdmin ? [...TABS, { href: "/expenses/categories", label: "Categories" }] : TABS;
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-4" aria-label="Expense sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={current === t.href ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${current === t.href ? "border-navy font-medium text-navy" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
