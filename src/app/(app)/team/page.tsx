import { listMembers, requireMember } from "@/lib/data";
import { mailConfigured } from "@/lib/mail";
import { adminCapacity } from "@/lib/time-data";
import { InfoTip, PageHeader } from "@/components/ui";
import { CapacityEditor } from "./CapacityEditor";
import { TeamTabs } from "./TeamTabs";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  const { user } = await requireMember("admin");
  const [members, capacity] = await Promise.all([listMembers(), adminCapacity()]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Team" tabs={<TeamTabs current="team" isAdmin isStaff />} />
      <p className="flex items-center gap-1.5 text-sm text-neutral-500">
        Only people on this list can sign in.
        <InfoTip>
          Members run projects and create, issue and send documents. Viewers can only look. Freelancers see only the projects they&apos;re added to (tasks and files), never clients
          or money.
        </InfoTip>
      </p>
      <TeamManager members={members} me={user.email ?? ""} mailReady={mailConfigured()} />
      <CapacityEditor people={capacity} />
    </div>
  );
}
