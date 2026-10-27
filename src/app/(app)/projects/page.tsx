import Link from "next/link";
import { Card } from "@/components/ui";
import { listClients, listDocuments, listProjects, requireMember } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { projectTotals } from "@/lib/projects";
import { ProjectForm } from "./ProjectForm";

export default async function ProjectsPage() {
  const { canEdit } = await requireMember();
  const [projects, clients, docs] = await Promise.all([listProjects(), listClients(), listDocuments()]);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <p className="text-sm text-neutral-500">Tag quotes and invoices to a project to see quoted, billed and received against its budget.</p>
      {canEdit && <ProjectForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
      <Card>
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">No projects yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="py-2 font-medium">Project</th>
                <th className="font-medium">Client</th>
                <th className="text-right font-medium">Budget</th>
                <th className="text-right font-medium">Quoted</th>
                <th className="text-right font-medium">Billed</th>
                <th className="text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {projects.map((p) => {
                const t = projectTotals(docs.filter((d) => d.project_id === p.id));
                const over = p.budget > 0 && t.billed > p.budget;
                return (
                  <tr key={p.id}>
                    <td className="py-2.5">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-navy">
                        {p.name}
                      </Link>
                      {p.status === "closed" && <span className="ml-2 text-xs text-neutral-400">closed</span>}
                    </td>
                    <td className="text-neutral-600">{p.client_name}</td>
                    <td className="text-right tabular-nums">{p.budget ? formatMoney(p.budget) : "—"}</td>
                    <td className="text-right tabular-nums">{formatMoney(t.quoted)}</td>
                    <td className={`text-right tabular-nums ${over ? "text-red-700" : ""}`}>{formatMoney(t.billed)}</td>
                    <td className="text-right tabular-nums">{formatMoney(t.received)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
