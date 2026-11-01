import { PageHeader } from "@/components/ui";
import { listTemplates } from "@/lib/agreement-data";
import { listLeads } from "@/lib/crm-data";
import { OPEN_STAGES } from "@/lib/crm";
import { listClients, listProjects, requireMember } from "@/lib/data";
import { NewAgreementForm } from "./NewAgreementForm";

export const metadata = { title: "New agreement" };

export default async function NewAgreementPage({ searchParams }: { searchParams: Promise<{ client?: string; project?: string; lead?: string; kind?: string }> }) {
  await requireMember("member");
  const sp = await searchParams;
  const [templates, clients, projects, leads] = await Promise.all([listTemplates(), listClients(), listProjects(), listLeads()]);
  const lead = leads.find((l) => l.id === sp.lead);
  const preferred = templates.find((t) => t.kind === sp.kind) ?? (lead ? templates.find((t) => t.kind === "proposal") : undefined);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/agreements", label: "Agreements" }}
        title="New agreement"
        subtitle="Pick a template. The client, project and studio details fill in for you; you can edit everything before sending."
      />
      <NewAgreementForm
        templates={templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind, description: t.description }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, client_id: p.client_id }))}
        leads={leads.filter((l) => OPEN_STAGES.includes(l.stage) || l.id === sp.lead).map((l) => ({ id: l.id, name: l.company || l.name, client_id: l.client_id }))}
        initial={{
          template_id: preferred?.id ?? templates[0]?.id ?? "",
          client_id: sp.client ?? lead?.client_id ?? "",
          project_id: sp.project ?? lead?.project_id ?? "",
          lead_id: lead?.id ?? "",
        }}
      />
    </div>
  );
}
