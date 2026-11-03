import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/Toaster";
import { requireTeam } from "@/lib/data";
import { runningTimer } from "@/lib/time-data";
import { signOut } from "../actions/auth";
import { Bell } from "./Bell";
import { NewMenu, ProfileMenu } from "./HeaderMenus";
import { Nav } from "./Nav";
import { Shortcuts } from "./Shortcuts";
import { TimerBar } from "./TimerBar";

const FREELANCER_PATHS = ["/my-work", "/projects", "/calendar", "/time", "/team/leave", "/expenses/claims", "/expenses/new"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user, role, canEdit, isAdmin }, timer, h] = await Promise.all([requireTeam(), runningTimer(), headers()]);
  // Freelancers only get these sections; everything else redirects before any streaming starts.
  const path = h.get("x-path") ?? "/";
  const allowed = FREELANCER_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) || /^\/expenses\/[0-9a-f-]{36}$/.test(path);
  if (role === "freelancer" && !allowed) redirect("/my-work");
  const meta = (user as { user_metadata?: { full_name?: string; name?: string } }).user_metadata;
  const displayName = meta?.full_name ?? meta?.name ?? "";
  return (
    <div className="min-h-screen md:pl-56 print:pl-0">
      <Nav role={role} />
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href={role === "freelancer" ? "/my-work" : "/"} className="font-serif text-lg leading-none text-navy uppercase md:hidden">
            Kora Kaagaz
          </Link>
          {role !== "freelancer" && (
            <form action="/search" role="search" className="hidden max-w-sm flex-1 md:block">
              <input
                name="q"
                type="search"
                aria-label={`Search projects, clients, leads and ${isAdmin ? "invoices" : "quotes"}`}
                placeholder={`Search projects, clients, leads, ${isAdmin ? "invoices" : "quotes"}…  /`}
                className="h-9 w-full rounded-lg border border-line bg-subtle px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-navy focus:bg-white"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-2 text-sm">
            <TimerBar
              timer={
                timer && timer.timer_started_at
                  ? { started: timer.timer_started_at, project_id: timer.project_id, project_code: timer.project_code, task_title: timer.task_title }
                  : null
              }
            />
            {role !== "freelancer" && (
              <Link href="/search" aria-label="Search" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-subtle md:hidden">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                  <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" strokeLinecap="round" />
                </svg>
              </Link>
            )}
            <NewMenu isStaff={role !== "freelancer"} canEdit={canEdit} isAdmin={isAdmin} />
            <Bell />
            <ProfileMenu email={user.email ?? ""} name={displayName} role={role} signOut={signOut} />
          </div>
        </div>
      </header>
      <Shortcuts canEdit={canEdit} isStaff={role !== "freelancer"} isAdmin={isAdmin} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:py-8 md:pb-8">{children}</main>
      <Toaster />
    </div>
  );
}
