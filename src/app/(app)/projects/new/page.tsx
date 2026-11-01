import Link from "next/link";
import { listClients, requireMember } from "@/lib/data";
import { todayIso } from "@/lib/money";
import { listTemplates, teamDirectory } from "@/lib/pm-data";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { email } = await requireMember("member");
  const { client } = await searchParams;
  const [templates, clients, people] = await Promise.all([listTemplates(), listClients(), teamDirectory()]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/projects" className="text-sm text-neutral-500 hover:text-navy">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">New project</h1>
      </div>
      <NewProjectForm
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          billing: t.billing,
          budget_hours: t.budget_hours,
          task_count: t.task_count,
          type: t.type,
        }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        people={people}
        me={email}
        today={todayIso()}
        clientId={client ?? ""}
      />
    </div>
  );
}
