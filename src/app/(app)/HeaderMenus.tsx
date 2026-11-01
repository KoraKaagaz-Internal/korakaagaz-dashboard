"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { button } from "@/components/ui";

function Menu({ label, trigger, children, className = "" }: { label: string; trigger: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className={className}>
        {trigger}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-xl bg-white p-1.5 text-sm shadow-lg ring-1 ring-black/10" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

const item = "block rounded-lg px-3 py-2 text-ink hover:bg-subtle";

/** "+ New" for everything you can create. */
export function NewMenu({ isStaff, canEdit }: { isStaff: boolean; canEdit: boolean }) {
  const items = [
    ...(canEdit && isStaff
      ? [
          { href: "/documents/new?type=invoice", label: "Invoice" },
          { href: "/documents/new?type=quote", label: "Quote" },
          { href: "/projects/new", label: "Project" },
          { href: "/crm/new", label: "Lead" },
          { href: "/agreements/new", label: "Proposal or contract" },
          { href: "/expenses/new", label: "Expense" },
          { href: "/calendar/new", label: "Event" },
        ]
      : []),
    ...(!isStaff ? [{ href: "/expenses/new", label: "Expense claim" }] : []),
  ];
  if (!items.length) return null;
  return (
    <Menu label="Create new" className={button("primary", "sm")} trigger={<>+ New</>}>
      {items.map((i) => (
        <Link key={i.href} role="menuitem" href={i.href} className={item}>
          {i.label}
        </Link>
      ))}
    </Menu>
  );
}

/** Name, role and sign out. */
export function ProfileMenu({ email, name, role, signOut }: { email: string; name: string; role: string; signOut: () => Promise<void> }) {
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  return (
    <Menu label="Your account" className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-medium text-white" trigger={initials}>
      <div className="border-b border-line px-3 pt-1.5 pb-2.5">
        <div className="truncate font-medium text-ink">{name || email.split("@")[0]}</div>
        <div className="truncate text-xs text-neutral-500">{email}</div>
        <div className="mt-0.5 text-xs text-neutral-500 capitalize">{role}</div>
      </div>
      <Link role="menuitem" href="/time?tab=week" className={`${item} mt-1`}>
        My timesheet
      </Link>
      <form action={signOut}>
        <button role="menuitem" className={`${item} w-full text-left`}>
          Sign out
        </button>
      </form>
    </Menu>
  );
}
