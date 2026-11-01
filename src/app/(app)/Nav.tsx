"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";

type Item = { href: string; label: string; icon: keyof typeof ICONS; match?: string };
type Group = { title?: string; items: Item[] };

// 20px outline icons (stroke = currentColor)
const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  check: "M4 12.5 9 17.5 20 6.5",
  folder: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z",
  calendar: "M4 6.5h16v13.5H4zM4 10.5h16M8 3.5v4M16 3.5v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  spark: "M4 19 9.5 12l4 3.5L20 6M15 6h5v5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2",
  doc: "M6 3h8.5L19 7.5V21H6zM14 3v5h5M9 12.5h7M9 16h7",
  receipt: "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21zM8.5 8h7M8.5 12h7",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  team: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  leave: "M12 3v18M5 8c2-3 5-3 7 0 2-3 5-3 7 0",
  wallet: "M3 7.5A2.5 2.5 0 0 1 5.5 5H19v4M3 7.5V18a2 2 0 0 0 2 2h15v-5M3 7.5h16a1 1 0 0 1 1 1V15h-4a2 2 0 0 1 0-4h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  pen: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4M14 20h6",
} as const;

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

function groups(role: Role): Group[] {
  if (role === "freelancer") {
    return [
      {
        items: [
          { href: "/my-work", label: "My work", icon: "check" },
          { href: "/projects", label: "Projects", icon: "folder" },
          { href: "/calendar", label: "Calendar", icon: "calendar" },
          { href: "/time", label: "Time", icon: "clock" },
          { href: "/team/leave", label: "Leave", icon: "leave" },
          { href: "/expenses/claims", label: "My claims", icon: "wallet" },
        ],
      },
    ];
  }
  return [
    {
      items: [
        { href: "/", label: "Home", icon: "home" },
        { href: "/my-work", label: "My work", icon: "check" },
      ],
    },
    {
      title: "Work",
      items: [
        { href: "/projects", label: "Projects", icon: "folder" },
        { href: "/calendar", label: "Calendar", icon: "calendar" },
        { href: "/time", label: "Time", icon: "clock" },
      ],
    },
    {
      title: "Sales",
      items: [
        { href: "/crm", label: "Leads", icon: "spark" },
        { href: "/clients", label: "Clients", icon: "users" },
        { href: "/agreements", label: "Agreements", icon: "pen" },
      ],
    },
    {
      title: "Money",
      items: [
        { href: "/documents", label: "Invoices", icon: "doc" },
        { href: "/expenses", label: "Expenses", icon: "receipt", match: "/expenses|/vendors" },
        { href: "/reports", label: "Reports", icon: "chart" },
      ],
    },
    {
      title: "Studio",
      items: [
        { href: role === "admin" ? "/team" : "/team/workload", label: "Team", icon: "team", match: "/team" },
        ...(role === "admin" ? [{ href: "/settings", label: "Settings", icon: "cog" as const, match: "/settings|/items|/expenses/categories|/crm/settings" }] : []),
      ],
    },
  ];
}

const startsWith = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The nav item for this path: the longest matching prefix wins (Settings' sub-pages beat Expenses). */
function currentHref(path: string, gs: Group[]) {
  let best = { href: "", len: -1 };
  for (const i of gs.flatMap((g) => g.items)) {
    for (const m of (i.match ?? i.href).split("|")) if (startsWith(path, m) && m.length > best.len) best = { href: i.href, len: m.length };
    if (startsWith(path, i.href) && i.href.length > best.len) best = { href: i.href, len: i.href.length };
  }
  return best.href;
}

/** Left sidebar on desktop; a bottom bar plus a "More" sheet on phones. */
export function Nav({ role }: { role: Role }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const gs = groups(role);
  const current = currentHref(path, gs);
  useEffect(() => setMore(false), [path]);

  const link = (n: Item, big = false) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={current === n.href ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 ${big ? "py-2.5 text-base" : "py-1.5 text-sm"} ${current === n.href ? "bg-white font-medium text-navy shadow-sm ring-1 ring-line" : "text-neutral-600 hover:bg-white/70 hover:text-ink"}`}
    >
      <Icon name={n.icon} className={`h-[18px] w-[18px] shrink-0 ${current === n.href ? "text-navy" : "text-neutral-400"}`} />
      {n.label}
    </Link>
  );
  const list = (big = false) =>
    gs.map((g, i) => (
      <div key={i} className="mb-5">
        {g.title && <div className="mb-1 px-2.5 text-[11px] font-medium tracking-wider text-neutral-400 uppercase">{g.title}</div>}
        <div className="space-y-0.5">{g.items.map((n) => link(n, big))}</div>
      </div>
    ));

  const all = gs.flatMap((g) => g.items);
  const bottomHrefs = role === "freelancer" ? ["/my-work", "/projects", "/time", "/calendar"] : ["/", "/my-work", "/projects", "/time"];
  const bottom = bottomHrefs.map((h) => all.find((i) => i.href === h)!).filter(Boolean);
  const inMore = !bottomHrefs.includes(current);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 overflow-y-auto border-r border-line bg-sidebar px-3 pt-5 pb-6 md:block print:hidden">
        <Link href={role === "freelancer" ? "/my-work" : "/"} className="mb-7 block px-2.5 font-serif text-xl leading-none text-navy uppercase">
          Kora Kaagaz
          <span className="mt-1 block font-sans text-[11px] tracking-[0.2em] text-neutral-400 normal-case">Studio</span>
        </Link>
        <nav aria-label="Main">{list()}</nav>
      </aside>

      {more && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-sidebar px-4 pt-4 pb-24">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300" />
            <nav aria-label="All sections">{list(true)}</nav>
          </div>
        </div>
      )}

      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        {bottom.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current === n.href ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${current === n.href ? "font-medium text-navy" : "text-neutral-500"}`}
          >
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${more || inMore ? "font-medium text-navy" : "text-neutral-500"}`}
        >
          <Icon name="more" />
          More
        </button>
      </nav>
    </>
  );
}
