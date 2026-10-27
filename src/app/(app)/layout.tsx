import { requireMember } from "@/lib/data";
import { signOut } from "../actions/auth";
import { Nav } from "./Nav";
import { Shortcuts } from "./Shortcuts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, canEdit } = await requireMember();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Nav role={role} canEdit={canEdit} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-neutral-500 lg:inline">
              {user.email} · <span className="capitalize">{role}</span>
            </span>
            <form action={signOut}>
              <button className="text-neutral-500 hover:text-neutral-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {canEdit && <Shortcuts />}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
