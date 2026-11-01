import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/data";
import { istDate } from "@/lib/calendar";
import { formatInvoiceDate } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { teamDirectory } from "@/lib/pm-data";
import { getEvent, listKit, loggableProjects } from "@/lib/time-data";
import { EventForm } from "../EventForm";
import { TYPE_LABEL } from "../EventChip";
import { PrintButton } from "./PrintButton";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

/** Event detail, doubling as a printable call sheet. Editors get ?edit=1. */
export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; conflicts?: string }> }) {
  const { canEdit } = await requireTeam();
  const { id } = await params;
  const sp = await searchParams;
  const [event, people, kit] = await Promise.all([getEvent(id), teamDirectory(), listKit()]);
  if (!event) notFound();

  if (sp.edit && canEdit) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <Link href={`/calendar/${id}`} className="text-sm text-neutral-500 hover:text-navy">
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold">Edit event</h1>
        </div>
        <EventForm event={event} date={istDate(event.starts_at)} projects={await loggableProjects()} people={people} kit={kit} />
      </div>
    );
  }

  const day1 = istDate(event.starts_at);
  const dayN = istDate(new Date(Math.max(Date.parse(event.starts_at), Date.parse(event.ends_at) - 1)).toISOString());
  const when = event.all_day
    ? day1 === dayN
      ? formatInvoiceDate(day1)
      : `${formatInvoiceDate(day1)} – ${formatInvoiceDate(dayN)}`
    : day1 === istDate(event.ends_at)
      ? `${formatInvoiceDate(day1)}, ${time(event.starts_at)} – ${time(event.ends_at)}`
      : `${formatInvoiceDate(day1)} ${time(event.starts_at)} – ${formatInvoiceDate(istDate(event.ends_at))} ${time(event.ends_at)}`;
  const kitItems = kit.filter((k) => event.kit.includes(k.id));

  return (
    <div className="mx-auto max-w-3xl space-y-5 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/calendar" className="text-sm text-neutral-500 hover:text-navy">
          ← Calendar
        </Link>
        <div className="flex gap-2">
          <PrintButton />
          {canEdit && (
            <Link href={`/calendar/${id}?edit=1`} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
              Edit
            </Link>
          )}
        </div>
      </div>
      {sp.conflicts && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden" role="alert">
          Saved, but someone or some kit is double-booked. Check the Crew &amp; kit view.
        </p>
      )}

      <article className="rounded-xl bg-white p-6 border border-line print:p-0 print:shadow-none print:ring-0">
        <div className="text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase">{event.type === "shoot" ? "Call sheet" : TYPE_LABEL[event.type]} · Kora Kaagaz</div>
        <h1 className="mt-1 text-2xl font-semibold">
          {event.title}
          {event.status !== "confirmed" && <span className="ml-2 align-middle text-sm font-medium text-amber-700 uppercase">{event.status}</span>}
        </h1>
        {event.project_id && (
          <Link href={`/projects/${event.project_id}`} className="text-sm text-neutral-500 hover:text-navy">
            {event.project_code} · {event.project_name}
          </Link>
        )}

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-neutral-500">When</dt>
            <dd className="font-medium">{when}</dd>
          </div>
          {event.call_time && (
            <div>
              <dt className="text-xs text-neutral-500">Call time</dt>
              <dd className="text-lg font-semibold">{event.call_time.slice(0, 5)}</dd>
            </div>
          )}
          {event.location && (
            <div>
              <dt className="text-xs text-neutral-500">Where</dt>
              <dd className="font-medium">
                {event.location}
                {event.map_url && (
                  <>
                    {" "}
                    <a href={event.map_url} target="_blank" rel="noopener noreferrer" className="text-navy underline print:hidden">
                      Map
                    </a>
                    <span className="hidden text-xs print:block">{event.map_url}</span>
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>

        {event.people.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Crew</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-neutral-100">
                {event.people.map((p, i) => (
                  <tr key={i}>
                    <td className="py-1.5 font-medium">{p.member_email ? displayName(p.member_email, people) : p.external_name}</td>
                    <td className="text-neutral-600">{p.role}</td>
                    <td className="text-right text-neutral-600">{p.phone || (p.member_email ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {kitItems.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Kit</h2>
            <ul className="columns-2 text-sm sm:columns-3">
              {kitItems.map((k) => (
                <li key={k.id}>
                  ☐ {k.name}
                  {k.serial && <span className="text-xs text-neutral-400"> · {k.serial}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.shot_list && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Shot list</h2>
            <p className="text-sm whitespace-pre-wrap">{event.shot_list}</p>
          </section>
        )}
        {event.contacts && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Contacts</h2>
            <p className="text-sm whitespace-pre-wrap">{event.contacts}</p>
          </section>
        )}
        {event.notes && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{event.notes}</p>
          </section>
        )}
      </article>
    </div>
  );
}
