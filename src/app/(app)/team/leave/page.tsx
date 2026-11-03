import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/data";
import { addDays, todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { listHolidays, listLeave, teamAway } from "@/lib/time-data";
import { TeamTabs } from "../TeamTabs";
import { LeaveManager } from "./LeaveManager";

export default async function LeavePage() {
  const { isAdmin, isStaff, email } = await requireTeam();
  const from = addDays(todayIso(), -90);
  const [own, away, holidays, people] = await Promise.all([listLeave(from), isAdmin || !isStaff ? Promise.resolve([]) : teamAway(from), listHolidays(), teamDirectory()]);
  // Members see their own requests in full and colleagues only as "away".
  const leave = [...own, ...away.filter((l) => l.member_email !== email)].sort((a, b) => b.from_date.localeCompare(a.from_date));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={isStaff ? "Team" : "Leave"} tabs={<TeamTabs current="leave" isAdmin={isAdmin} isStaff={isStaff} />} />
      <p className="text-sm text-neutral-500">Approved leave and holidays come off people&apos;s available hours and show on the calendar.</p>
      <LeaveManager leave={leave} holidays={holidays} people={people} me={email} isAdmin={isAdmin} today={todayIso()} />
    </div>
  );
}
