import { PageHeader, Tabs } from "@/components/ui";

const SECTIONS = [
  { href: "/settings", label: "General" },
  { href: "/items", label: "Items" },
  { href: "/expenses/categories", label: "Expense categories" },
  { href: "/crm/settings", label: "Enquiry & booking" },
];

/** One header for every admin setting, wherever its page lives. */
export function SettingsHeader({ current, subtitle }: { current: string; subtitle?: React.ReactNode }) {
  return <PageHeader title="Settings" subtitle={subtitle} tabs={<Tabs label="Settings sections" items={SECTIONS.map((s) => ({ ...s, active: s.href === current }))} />} />;
}
