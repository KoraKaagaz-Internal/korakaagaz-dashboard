import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "@/components/ui/Toaster";
import { requireTeam } from "@/lib/data";
import { runningTimer } from "@/lib/time-data";
import { signOut } from "../actions/auth";
import { Bell } from "./Bell";
import { Nav } from "./Nav";
import { Shortcuts } from "./Shortcuts";
import { TimerBar } from "./TimerBar";

const FREELANCER_PATHS = ["/my-work", "/projects", "/calendar", "/time", "/team/leave", "/expenses/claims", "/expenses/new"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user, role, canEdit }, timer, h] = await Promise.all([requireTeam(), runningTimer(), headers()]);
  // Freelancers only get these sections; everything else redirects before any streaming starts.
  const path = h.get("x-path") ?? "/";
  const allowed = FREELANCER_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) || /^\/expenses\/[0-9a-f-]{36}$/.test(path);
  if (role === "freelancer" && !allowed) redirect("/my-work");
  return (
    <div className="min-h-screen md:pl-56 print:pl-0">
      <Nav role={role} />
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <span className="ml-16 font-serif text-lg leading-none text-navy uppercase md:hidden">Kora Kaagaz</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <TimerBar
              timer={
                timer && timer.timer_started_at
                  ? { started: timer.timer_started_at, project_id: timer.project_id, project_code: timer.project_code, task_title: timer.task_title }
                  : null
              }
            />
            <span className="hidden text-neutral-500 lg:inline">
              {user.email} · <span className="capitalize">{role}</span>
            </span>
            <Bell />
            <form action={signOut}>
              <button className="text-neutral-500 hover:text-neutral-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <Shortcuts canEdit={canEdit} isStaff={role !== "freelancer"} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:py-8 md:pb-8">{children}</main>
      <Toaster />
    </div>
  );
}
