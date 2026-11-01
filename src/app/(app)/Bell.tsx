"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchNotifications, markNotificationsRead } from "@/app/actions/projects";
import type { Notification } from "@/lib/pm";

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

/** In-app notifications. Loads once, when opened, and every 2 minutes while the tab is visible. */
export function Bell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = () =>
    fetchNotifications()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 120000);
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => {
      clearInterval(id);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      await markNotificationsRead();
      setUnread(0);
    }
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={toggle}
        className="relative rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold">Notifications</div>
          <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">Nothing yet.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.link || "#"} onClick={() => setOpen(false)} className={`block px-4 py-2.5 text-sm hover:bg-neutral-50 ${n.read_at ? "" : "bg-navy/[0.04]"}`}>
                  <div className="flex justify-between gap-3">
                    <span className="font-medium text-neutral-900">{n.title}</span>
                    <span className="shrink-0 text-xs text-neutral-400">{ago(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-neutral-600">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-neutral-400">{n.actor_email}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
