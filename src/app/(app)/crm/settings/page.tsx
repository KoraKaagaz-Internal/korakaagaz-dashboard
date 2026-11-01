import { getSettings, requireMember } from "@/lib/data";
import { SettingsHeader } from "../../settings/SettingsTabs";
import { BookingSettingsForm } from "./BookingSettingsForm";

export default async function CrmSettingsPage() {
  await requireMember("admin");
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SettingsHeader current="/crm/settings" subtitle="Your public enquiry form and discovery-call booking page." />
      <BookingSettingsForm booking={settings.booking} services={settings.enquiry_services} site={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />
    </div>
  );
}
