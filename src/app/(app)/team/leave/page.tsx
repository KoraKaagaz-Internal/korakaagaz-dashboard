import Link from "next/link";
import { requireTeam } from "@/lib/data";
import { addDays, todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { listHolidays, listLeave } from "@/lib/time-data";
import { LeaveManager } from "./LeaveManager";

export default async function LeavePage() {
  const { isAdmin, isStaff, email } = await requireTeam();
  const [leave, holidays, people] = await Promise.all([listLeave(addDays(todayIso(), -90)), listHolidays(), teamDirectory()]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        {isStaff && (
          <Link href="/team/workload" className="text-sm text-neutral-500 hover:text-navy">
            ← Workload
          </Link>
        )}
        <h1 className="text-2xl font-semibold">Leave &amp; holidays</h1>
        <p className="text-sm text-neutral-500">Approved leave and holidays come off people&apos;s capacity in the workload view and show on the calendar.</p>
      </div>
      <LeaveManager leave={leave} holidays={holidays} people={people} me={email} isAdmin={isAdmin} today={todayIso()} />
    </div>
  );
}
