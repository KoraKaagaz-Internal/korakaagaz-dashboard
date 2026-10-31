"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/types";

type Item = { href: string; label: string };
type Group = { title?: string; items: Item[] };

function groups(role: Role): Group[] {
  if (role === "freelancer") {
    return [
      {
        items: [
          { href: "/my-work", label: "My work" },
          { href: "/projects", label: "Projects" },
          { href: "/calendar", label: "Calendar" },
          { href: "/time", label: "Time" },
          { href: "/expenses/claims", label: "My claims" },
        ],
      },
    ];
  }
  return [
    {
      items: [
        { href: "/", label: "Home" },
        { href: "/my-work", label: "My work" },
      ],
    },
    {
      title: "Work",
      items: [
        { href: "/projects", label: "Projects" },
        { href: "/calendar", label: "Calendar" },
        { href: "/time", label: "Time" },
      ],
    },
    {
      title: "People",
      items: [
        { href: "/team/workload", label: "Workload" },
        { href: "/team/leave", label: "Leave" },
      ],
    },
    {
      title: "Clients",
      items: [
        { href: "/crm", label: "Leads" },
        { href: "/clients", label: "Clients" },
      ],
    },
    {
      title: "Money",
      items: [
        { href: "/documents", label: "Invoices & quotes" },
        { href: "/expenses", label: "Expenses" },
        { href: "/items", label: "Items" },
        { href: "/reports", label: "Reports" },
      ],
    },
    ...(role === "admin"
      ? [
          {
            title: "Studio",
            items: [
              { href: "/team", label: "Team" },
              { href: "/settings", label: "Settings" },
            ],
          },
        ]
      : []),
  ];
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** Left sidebar on desktop; a menu sheet plus a bottom bar on phones. */
export function Nav({ role }: { role: Role }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const gs = groups(role);
  // the most specific matching link wins (/team/workload highlights Workload, not Team)
  const current = gs
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => isActive(path, h))
    .sort((a, b) => b.length - a.length)[0];
  const list = (onClick?: () => void) =>
    gs.map((g, i) => (
      <div key={i} className="mb-4">
        {g.title && <div className="mb-1 px-2 text-[11px] font-medium tracking-wider text-neutral-400 uppercase">{g.title}</div>}
        {g.items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onClick}
            aria-current={current === n.href ? "page" : undefined}
            className={`block rounded-md px-2 py-1.5 text-sm ${current === n.href ? "bg-navy/10 font-medium text-navy" : "text-neutral-700 hover:bg-neutral-100"}`}
          >
            {n.label}
          </Link>
        ))}
      </div>
    ));

  const bottom: Item[] =
    role === "freelancer"
      ? [
          { href: "/my-work", label: "My work" },
          { href: "/projects", label: "Projects" },
          { href: "/calendar", label: "Calendar" },
          { href: "/time", label: "Time" },
        ]
      : [
          { href: "/", label: "Home" },
          { href: "/my-work", label: "My work" },
          { href: "/calendar", label: "Calendar" },
          { href: "/time", label: "Time" },
        ];

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 border-r border-black/5 bg-white px-3 pt-4 pb-6 md:block print:hidden">
        <Link href={role === "freelancer" ? "/my-work" : "/"} className="mb-6 block px-2 font-serif text-xl leading-none text-navy uppercase">
          Kora Kaagaz
          <span className="mt-1 block font-sans text-[11px] tracking-[0.2em] text-neutral-400 normal-case">Studio</span>
        </Link>
        <nav aria-label="Main">{list()}</nav>
      </aside>

      <div className="fixed top-3 left-4 z-40 md:hidden print:hidden">
        <button
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          Menu
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 top-14 z-40 max-h-[80vh] overflow-y-auto border-b border-black/5 bg-white px-4 py-3 shadow-sm md:hidden">
          {list(() => setOpen(false))}
        </div>
      )}

      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-black/5 bg-white/95 backdrop-blur md:hidden print:hidden">
        {bottom.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex-1 py-3 text-center text-xs ${isActive(path, n.href) ? "font-semibold text-navy" : "text-neutral-600"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
