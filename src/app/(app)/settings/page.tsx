import { getSettings } from "@/lib/data";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
