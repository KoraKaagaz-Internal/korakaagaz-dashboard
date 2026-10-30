import { listMembers, requireMember } from "@/lib/data";
import { mailConfigured } from "@/lib/mail";
import { TeamManager } from "./TeamManager";

export default async function TeamPage() {
  const { user } = await requireMember("admin");
  const members = await listMembers();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="text-sm text-neutral-500">
        Only people on this list can sign in. Anyone else who finds the link is turned away at the Google sign-in. Members can run projects and create, issue and send documents. Viewers can only look. Freelancers see only the projects they&apos;re added to (their tasks and files) and never see clients, money or billing.
      </p>
      <TeamManager members={members} me={user.email ?? ""} mailReady={mailConfigured()} />
    </div>
  );
}
