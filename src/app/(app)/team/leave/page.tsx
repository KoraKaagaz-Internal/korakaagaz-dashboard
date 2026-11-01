import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/data";
import { addDays, todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { listHolidays, listLeave } from "@/lib/time-data";
import { TeamTabs } from "../TeamTabs";
import { LeaveManager } from "./LeaveManager";

export default async function LeavePage() {
  const { isAdmin, isStaff, email } = await requireTeam();
  const [leave, holidays, people] = await Promise.all([listLeave(addDays(todayIso(), -90)), listHolidays(), teamDirectory()]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={isStaff ? "Team" : "Leave"} tabs={<TeamTabs current="leave" isAdmin={isAdmin} isStaff={isStaff} />} />
      <p className="text-sm text-neutral-500">Approved leave and holidays come off people&apos;s available hours and show on the calendar.</p>
      <LeaveManager leave={leave} holidays={holidays} people={people} me={email} isAdmin={isAdmin} today={todayIso()} />
    </div>
  );
}
