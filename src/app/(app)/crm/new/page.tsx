import Link from "next/link";
import { getSettings, requireMember } from "@/lib/data";
import { teamDirectory } from "@/lib/pm-data";
import { LeadForm } from "../LeadForm";
import { PageHeader } from "@/components/ui";

export default async function NewLeadPage() {
  const { email } = await requireMember("member");
  const [people, settings] = await Promise.all([teamDirectory(), getSettings()]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader back={{ href: "/crm", label: "Leads" }} title="New lead" />
      <LeadForm people={people} services={settings.enquiry_services} me={email} />
    </div>
  );
}
