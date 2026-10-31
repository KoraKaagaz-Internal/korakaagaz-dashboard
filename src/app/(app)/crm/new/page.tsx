import Link from "next/link";
import { getSettings, requireMember } from "@/lib/data";
import { teamDirectory } from "@/lib/pm-data";
import { LeadForm } from "../LeadForm";

export default async function NewLeadPage() {
  const { email } = await requireMember("member");
  const [people, settings] = await Promise.all([teamDirectory(), getSettings()]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/crm" className="text-sm text-neutral-500 hover:text-navy">
          ← Leads
        </Link>
        <h1 className="text-2xl font-semibold">New lead</h1>
      </div>
      <LeadForm people={people} services={settings.enquiry_services} me={email} />
    </div>
  );
}
