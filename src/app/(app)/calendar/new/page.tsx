import Link from "next/link";
import { requireMember } from "@/lib/data";
import { todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { listKit, loggableProjects } from "@/lib/time-data";
import { EventForm } from "../EventForm";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ date?: string; project?: string }> }) {
  await requireMember("member");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIso();
  const [projects, people, kit] = await Promise.all([loggableProjects(), teamDirectory(), listKit()]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/calendar" className="text-sm text-neutral-500 hover:text-navy">
          ← Calendar
        </Link>
        <h1 className="text-2xl font-semibold">New event</h1>
      </div>
      <EventForm event={null} date={date} projectId={sp.project} projects={projects} people={people} kit={kit} />
    </div>
  );
}
