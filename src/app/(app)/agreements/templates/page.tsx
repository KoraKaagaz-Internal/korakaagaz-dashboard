import { PageHeader } from "@/components/ui";
import { listTemplates } from "@/lib/agreement-data";
import { MERGE_FIELDS } from "@/lib/agreements";
import { requireMember } from "@/lib/data";
import { AgreementTabs } from "../AgreementTabs";
import { TemplateManager } from "./TemplateManager";

export const metadata = { title: "Agreement templates" };

export default async function TemplatesPage() {
  const { canEdit } = await requireMember();
  const templates = await listTemplates();
  return (
    <div>
      <PageHeader
        title="Agreements"
        subtitle="Templates: write once with fields like {{client.name}}; every new agreement starts from one."
        tabs={<AgreementTabs current="/agreements/templates" />}
      />
      <TemplateManager templates={templates} fields={MERGE_FIELDS} canEdit={canEdit} />
    </div>
  );
}
