import { Tabs, type Tone } from "@/components/ui";
import type { AgreementStatus } from "@/lib/agreements";

export const STATUS_TONE: Record<AgreementStatus, Tone> = { draft: "neutral", sent: "warn", signed: "ok", declined: "danger", expired: "neutral", void: "neutral" };

const TABS = [
  { href: "/agreements", label: "All" },
  { href: "/agreements?status=draft", label: "Drafts" },
  { href: "/agreements?status=sent", label: "Waiting for signature" },
  { href: "/agreements?status=signed", label: "Signed" },
  { href: "/agreements/templates", label: "Templates" },
];

export function AgreementTabs({ current }: { current: string }) {
  return <Tabs label="Agreement sections" items={TABS.map((t) => ({ ...t, active: t.href === current }))} />;
}
