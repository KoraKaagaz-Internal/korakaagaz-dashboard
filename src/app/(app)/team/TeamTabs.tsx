import { Tabs } from "@/components/ui";

/** Team · Workload · Leave, one header for the people pages. */
export function TeamTabs({ current, isAdmin, isStaff }: { current: "team" | "workload" | "leave"; isAdmin: boolean; isStaff: boolean }) {
  const items = [
    ...(isAdmin ? [{ key: "team", href: "/team", label: "People" }] : []),
    ...(isStaff ? [{ key: "workload", href: "/team/workload", label: "Workload" }] : []),
    { key: "leave", href: "/team/leave", label: "Leave & holidays" },
  ];
  return <Tabs label="Team sections" items={items.map((i) => ({ href: i.href, label: i.label, active: i.key === current }))} />;
}
