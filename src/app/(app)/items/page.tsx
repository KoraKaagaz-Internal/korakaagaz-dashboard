import { listItems, requireMember } from "@/lib/data";
import { ItemsManager } from "./ItemsManager";

export default async function ItemsPage() {
  const { canEdit } = await requireMember();
  const items = await listItems();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Items</h1>
      <p className="text-sm text-neutral-500">Services you bill often. Pick them in the editor with &quot;From items&quot;. Design services are usually SAC 998391.</p>
      <ItemsManager initial={items} canEdit={canEdit} />
    </div>
  );
}
