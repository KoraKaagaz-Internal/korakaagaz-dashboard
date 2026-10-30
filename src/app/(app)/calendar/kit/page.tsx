import Link from "next/link";
import { requireMember } from "@/lib/data";
import { listKit } from "@/lib/time-data";
import { KitManager } from "./KitManager";

export default async function KitPage() {
  await requireMember("member");
  const kit = await listKit();
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/calendar" className="text-sm text-neutral-500 hover:text-navy">
          ← Calendar
        </Link>
        <h1 className="text-2xl font-semibold">Kit</h1>
        <p className="text-sm text-neutral-500">Cameras, lenses, lights and props you book onto shoots. The calendar warns when something is booked twice.</p>
      </div>
      <KitManager kit={kit} />
    </div>
  );
}
