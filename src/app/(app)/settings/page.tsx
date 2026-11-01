import { getSettings, listBankAccounts, requireMember } from "@/lib/data";
import { mailConfigured } from "@/lib/mail";
import { BankAccounts } from "./BankAccounts";
import { SettingsForm } from "./SettingsForm";
import { SettingsHeader } from "./SettingsTabs";
import { TimeApproval } from "./TimeApproval";

export default async function SettingsPage() {
  await requireMember("admin");
  const [settings, banks] = await Promise.all([getSettings(), listBankAccounts(true)]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SettingsHeader current="/settings" />
      <SettingsForm settings={settings} mailReady={mailConfigured()} />
      <BankAccounts banks={banks} />
      <TimeApproval on={settings.time_approval} />
    </div>
  );
}
