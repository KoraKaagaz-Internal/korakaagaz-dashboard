import { Tabs } from "@/components/ui";

const TABS = [
  { href: "/expenses", label: "All expenses" },
  { href: "/expenses?show=unpaid", label: "Bills to pay" },
  { href: "/expenses/claims", label: "Team claims" },
  { href: "/expenses/gst", label: "GST & TDS" },
  { href: "/vendors", label: "Vendors" },
];

// Members see project costs and their own claims; paying, GST and vendors are the admin's.
const MEMBER_TABS = [
  { href: "/expenses", label: "Project costs" },
  { href: "/expenses/claims", label: "My claims" },
];

export function ExpenseTabs({ current, isAdmin = true }: { current: string; isAdmin?: boolean }) {
  return <Tabs label="Expense sections" items={(isAdmin ? TABS : MEMBER_TABS).map((t) => ({ ...t, active: t.href === current }))} />;
}
