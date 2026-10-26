import Link from "next/link";
import { requireOwner } from "@/lib/data";
import { signOut } from "../actions";

const NAV = [
  { href: "/invoices", label: "Invoices" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOwner();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/invoices" className="font-serif text-xl leading-none text-navy uppercase">
            Kora Kaagaz
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-neutral-700 hover:bg-neutral-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/invoices/new" className="rounded-lg bg-navy px-3 py-1.5 font-medium text-white">
              New invoice
            </Link>
            <span className="hidden text-neutral-500 sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="text-neutral-500 hover:text-neutral-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
