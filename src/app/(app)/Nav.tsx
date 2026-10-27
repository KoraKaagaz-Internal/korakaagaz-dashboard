"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/types";

export function Nav({ role, canEdit }: { role: Role; canEdit: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/documents", label: "Documents" },
    { href: "/clients", label: "Clients" },
    { href: "/projects", label: "Projects" },
    { href: "/items", label: "Items" },
    { href: "/reports", label: "Reports" },
    ...(role === "admin" ? [{ href: "/team", label: "Team" }, { href: "/settings", label: "Settings" }] : []),
  ];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <Link href="/" className="font-serif text-xl leading-none whitespace-nowrap text-navy uppercase">
        Kora Kaagaz
      </Link>
      <nav className="hidden gap-0.5 text-sm md:flex">
        {links.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-2.5 py-1.5 ${active(n.href) ? "bg-navy/10 text-navy" : "text-neutral-700 hover:bg-neutral-100"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      {canEdit && (
        <Link href="/documents/new?type=invoice" className="hidden rounded-lg bg-navy px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white sm:inline-block">
          New invoice
        </Link>
      )}
      <button className="rounded-md border border-neutral-200 px-2 py-1 text-sm md:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
        Menu
      </button>
      {open && (
        <div className="absolute inset-x-0 top-14 border-b border-black/5 bg-white px-4 py-2 shadow-sm md:hidden">
          {links.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 text-sm text-neutral-800">
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
