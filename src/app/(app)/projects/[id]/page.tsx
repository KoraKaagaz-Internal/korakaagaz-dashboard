import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatusPill, displayStatus } from "@/components/ui";
import { listClients, listDocuments, listProjects, requireMember } from "@/lib/data";
import { formatInvoiceDate, formatMoney } from "@/lib/money";
import { projectTotals } from "@/lib/projects";
import { DOC_LABELS } from "@/lib/types";
import { ProjectForm } from "../ProjectForm";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { canEdit } = await requireMember();
  const { id } = await params;
  const [projects, docs, clients] = await Promise.all([listProjects(), listDocuments({ project: id }), listClients()]);
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();
  const t = projectTotals(docs);
  const pct = (n: number) => (project.budget > 0 ? `${Math.round((n / project.budget) * 100)}% of budget` : "");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/projects" className="text-sm text-neutral-500 hover:text-navy">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-neutral-500">
          <Link href={`/clients/${project.client_id}`} className="hover:text-navy">
            {project.client_name}
          </Link>
          {project.budget ? ` · budget ${formatMoney(project.budget)}` : ""}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Quoted", t.quoted],
          ["Billed", t.billed],
          ["Received", t.received],
          ["Outstanding", t.outstanding],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
            <div className="text-xs text-neutral-500">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatMoney(value as number)}</div>
            <div className="text-xs text-neutral-500">{label !== "Outstanding" ? pct(value as number) : ""}</div>
          </div>
        ))}
      </div>
      <Card title="Documents">
        {docs.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing tagged to this project yet. Pick it in the editor&apos;s &quot;Project&quot; field.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                  <span className="w-28 font-mono text-xs">{d.number ?? "Draft"}</span>
                  <span className="w-24 text-neutral-500">{DOC_LABELS[d.doc_type].short}</span>
                  <span className="flex-1 text-neutral-600">{formatInvoiceDate(d.issue_date)}</span>
                  <span className="tabular-nums">{formatMoney(d.total, d.currency)}</span>
                  <StatusPill status={displayStatus(d)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canEdit && <ProjectForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} project={project} />}
    </div>
  );
}
