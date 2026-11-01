import Link from "next/link";
import { requireMember } from "@/lib/data";
import { listKit } from "@/lib/time-data";
import { KitManager } from "./KitManager";
import { PageHeader } from "@/components/ui";

export default async function KitPage() {
  await requireMember("member");
  const kit = await listKit();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        back={{ href: "/calendar", label: "Calendar" }}
        title="Kit"
        subtitle="Cameras, lenses, lights and props you book onto shoots. The calendar warns when something is booked twice."
      />
      <KitManager kit={kit} />
    </div>
  );
}
