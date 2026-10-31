import Link from "next/link";
import { getSettings, requireMember } from "@/lib/data";
import { BookingSettingsForm } from "./BookingSettingsForm";

export default async function CrmSettingsPage() {
  await requireMember("admin");
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/crm" className="text-sm text-neutral-500 hover:text-navy">
          ← Leads
        </Link>
        <h1 className="text-2xl font-semibold">Enquiry form &amp; booking page</h1>
      </div>
      <BookingSettingsForm booking={settings.booking} services={settings.enquiry_services} site={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />
    </div>
  );
}
