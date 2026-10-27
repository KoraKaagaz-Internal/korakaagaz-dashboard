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
        Only people on this list can sign in. Anyone else who finds the link is turned away at the Google sign-in. Members can create, issue and send documents; viewers can only look and download PDFs.
      </p>
      <TeamManager members={members} me={user.email ?? ""} mailReady={mailConfigured()} />
    </div>
  );
}
