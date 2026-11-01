import { Tabs } from "@/components/ui";

const TABS = [
  { href: "/expenses", label: "All expenses" },
  { href: "/expenses?show=unpaid", label: "Bills to pay" },
  { href: "/expenses/claims", label: "Team claims" },
  { href: "/expenses/gst", label: "GST & TDS" },
  { href: "/vendors", label: "Vendors" },
];

export function ExpenseTabs({ current }: { current: string; isAdmin?: boolean }) {
  return <Tabs label="Expense sections" items={TABS.map((t) => ({ ...t, active: t.href === current }))} />;
}
