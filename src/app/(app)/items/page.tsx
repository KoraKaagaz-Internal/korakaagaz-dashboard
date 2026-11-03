import { PageHeader } from "@/components/ui";
import { listItems, requireMember } from "@/lib/data";
import { SettingsHeader } from "../settings/SettingsTabs";
import { ItemsManager } from "./ItemsManager";

export default async function ItemsPage() {
  const { canEdit, isAdmin } = await requireMember("admin");
  const items = await listItems();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {isAdmin ? (
        <SettingsHeader current="/items" subtitle="Services you bill often. Pick them in the invoice editor with “From items”." />
      ) : (
        <PageHeader title="Items" back={{ href: "/documents", label: "Invoices" }} subtitle="Services you bill often. Pick them in the invoice editor with “From items”." />
      )}
      <ItemsManager initial={items} canEdit={canEdit} />
    </div>
  );
}
