"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { checkConflicts, deleteEvent, saveEvent } from "@/app/actions/calendar";
import { PeoplePicker } from "@/components/pm/PeoplePicker";
import { Card, ConfirmButton, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { EVENT_TYPES, isoToIstLocal, istDate, istLocalToIso, type Conflict, type EventStatus, type EventType, type StudioEvent } from "@/lib/calendar";
import { addDays } from "@/lib/money";
import type { Person } from "@/lib/pm";
import type { KitItem } from "@/lib/time-data";
import { navigate } from "@/lib/navigate";

type External = { external_name: string; role: string; phone: string };

export function EventForm({
  event,
  date,
  projectId,
  projects,
  people,
  kit,
}: {
  event: StudioEvent | null;
  date: string;
  projectId?: string;
  projects: { id: string; code: string; name: string }[];
  people: Person[];
  kit: KitItem[];
}) {
  const router = useRouter();
  const allDayEnd = event?.all_day ? istDate(new Date(Date.parse(event.ends_at) - 1).toISOString()) : date;
  const [f, setF] = useState({
    type: (event?.type ?? "shoot") as EventType,
    title: event?.title ?? "",
    project_id: event?.project_id ?? projectId ?? "",
    status: (event?.status ?? "confirmed") as EventStatus,
    all_day: event?.all_day ?? false,
    start: event ? isoToIstLocal(event.starts_at) : `${date}T09:00`,
    end: event ? isoToIstLocal(event.ends_at) : `${date}T18:00`,
    startDay: event ? istDate(event.starts_at) : date,
    endDay: allDayEnd,
    call_time: event?.call_time?.slice(0, 5) ?? "",
    location: event?.location ?? "",
    map_url: event?.map_url ?? "",
    notes: event?.notes ?? "",
    shot_list: event?.shot_list ?? "",
    contacts: event?.contacts ?? "",
  });
  const [team, setTeam] = useState<string[]>(event?.people.filter((p) => p.member_email).map((p) => p.member_email!) ?? []);
  const [roles, setRoles] = useState<Record<string, string>>(Object.fromEntries((event?.people ?? []).filter((p) => p.member_email).map((p) => [p.member_email!, p.role])));
  const [ext, setExt] = useState<External[]>(event?.people.filter((p) => !p.member_email).map((p) => ({ external_name: p.external_name, role: p.role, phone: p.phone })) ?? []);
  const [kitSel, setKitSel] = useState<string[]>(event?.kit ?? []);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const times = useMemo(() => {
    try {
      if (f.all_day) return { starts_at: istLocalToIso(`${f.startDay}T00:00`), ends_at: istLocalToIso(`${addDays(f.endDay < f.startDay ? f.startDay : f.endDay, 1)}T00:00`) };
      return { starts_at: istLocalToIso(f.start), ends_at: istLocalToIso(f.end) };
    } catch {
      return null;
    }
  }, [f.all_day, f.start, f.end, f.startDay, f.endDay]);

  useEffect(() => {
    if (!times) return;
    const id = setTimeout(() => {
      checkConflicts({ id: event?.id, ...times, status: f.status, type: f.type, people: team, kit: kitSel })
        .then(setConflicts)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [times, f.status, f.type, team, kitSel, event?.id]);

  const names = (emails: string[]) => emails.map((e) => people.find((p) => p.email === e)?.name || e.split("@")[0]).join(", ");
  const kitNames = (ids: string[]) => ids.map((id) => kit.find((k) => k.id === id)?.name ?? "kit").join(", ");
  const categories = [...new Set(kit.map((k) => k.category || "Other"))];

  const submit = () =>
    start(async () => {
      if (!times) return setMsg("Check the dates and times");
      const r = await saveEvent({
        id: event?.id,
        type: f.type,
        title: f.title,
        project_id: f.project_id || null,
        ...times,
        all_day: f.all_day,
        status: f.status,
        call_time: f.call_time || null,
        location: f.location,
        map_url: f.map_url,
        notes: f.notes,
        shot_list: f.shot_list,
        contacts: f.contacts,
        people: [
          ...team.map((e) => ({ member_email: e, external_name: "", role: roles[e] ?? "", phone: "" })),
          ...ext.filter((x) => x.external_name.trim()).map((x) => ({ member_email: null, ...x })),
        ],
        kit: kitSel,
      });
      if (!r.ok) return setMsg(r.message);
      navigate(router, `/calendar/${r.id}${r.conflicts.length ? "?conflicts=1" : ""}`);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EventType })}>
              {EVENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EventStatus })}>
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative (pencilled in)</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Acme lookbook shoot, day 1" autoFocus={!event} />
          </Field>
          <Field label="Project">
            <Select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={f.all_day} onChange={(e) => setF({ ...f, all_day: e.target.checked })} />
            All day
          </label>
          {f.all_day ? (
            <>
              <Field label="From">
                <Input type="date" value={f.startDay} onChange={(e) => setF({ ...f, startDay: e.target.value, endDay: f.endDay < e.target.value ? e.target.value : f.endDay })} />
              </Field>
              <Field label="To (last day)">
                <Input type="date" value={f.endDay} min={f.startDay} onChange={(e) => setF({ ...f, endDay: e.target.value })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Starts">
                <Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, end: f.end < e.target.value ? e.target.value : f.end })} />
              </Field>
              <Field label="Ends">
                <Input type="datetime-local" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} />
              </Field>
            </>
          )}
          {f.type === "shoot" && (
            <Field label="Call time">
              <Input type="time" value={f.call_time} onChange={(e) => setF({ ...f, call_time: e.target.value })} />
            </Field>
          )}
          <Field label="Location">
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Studio 2, Rourkela" />
          </Field>
          <Field label="Map link">
            <Input value={f.map_url} onChange={(e) => setF({ ...f, map_url: e.target.value })} placeholder="https://maps.app.goo.gl/…" />
          </Field>
        </div>
      </Card>

      <Card title="Crew">
        <div className="space-y-3">
          <PeoplePicker people={people.filter((p) => p.role !== "viewer")} value={team} onChange={setTeam} label="Book team members" />
          {team.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {team.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="w-40 truncate">{names([e])}</span>
                  <Input
                    className="!w-56"
                    value={roles[e] ?? ""}
                    onChange={(ev) => setRoles({ ...roles, [e]: ev.target.value })}
                    placeholder="Role (photographer, stylist…)"
                    aria-label={`Role for ${names([e])}`}
                  />
                </li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">Outside crew and talent</div>
            {ext.map((x, i) => (
              <div key={i} className="mb-1.5 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input
                  value={x.external_name}
                  onChange={(e) => setExt(ext.map((y, j) => (j === i ? { ...y, external_name: e.target.value } : y)))}
                  placeholder="Name"
                  aria-label="Name"
                />
                <Input
                  value={x.role}
                  onChange={(e) => setExt(ext.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))}
                  placeholder="Role (model, MUA…)"
                  aria-label="Role"
                />
                <Input value={x.phone} onChange={(e) => setExt(ext.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} placeholder="Phone" aria-label="Phone" />
                <button className={btn.ghost} onClick={() => setExt(ext.filter((_, j) => j !== i))} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
            <button className={btn.ghost} onClick={() => setExt([...ext, { external_name: "", role: "", phone: "" }])}>
              + Add person
            </button>
          </div>
        </div>
      </Card>

      <Card title={`Kit${kitSel.length ? ` · ${kitSel.length}` : ""}`}>
        {kit.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <fieldset key={c}>
                <legend className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{c}</legend>
                {kit
                  .filter((k) => (k.category || "Other") === c && (k.active || kitSel.includes(k.id)))
                  .map((k) => (
                    <label key={k.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={kitSel.includes(k.id)}
                        onChange={() => setKitSel(kitSel.includes(k.id) ? kitSel.filter((x) => x !== k.id) : [...kitSel, k.id])}
                      />
                      {k.name}
                    </label>
                  ))}
              </fieldset>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No kit list yet. Add cameras, lenses and lights under Calendar → Kit.</p>
        )}
      </Card>

      {conflicts.length > 0 && (
        <div className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn ring-1 ring-warn/20" role="alert">
          <b>Double booking:</b>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={c.with.id}>
                {c.people.length > 0 && `${names(c.people)} `}
                {c.kit.length > 0 && `${c.people.length ? "and " : ""}${kitNames(c.kit)} `}
                {c.people.length + c.kit.length === 1 ? "is" : "are"} also on “{c.with.title}”{c.with.status === "tentative" ? " (tentative)" : ""} at{" "}
                {new Date(c.with.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">You can still save; this is a warning.</p>
        </div>
      )}

      <Card title="Call sheet details">
        <div className="grid gap-3">
          <Field label="Shot list">
            <Textarea
              rows={5}
              value={f.shot_list}
              onChange={(e) => setF({ ...f, shot_list: e.target.value })}
              placeholder={"1. Hero product on white\n2. Lifestyle, kitchen\n3. Detail close-ups"}
            />
          </Field>
          <Field label="Contacts on the day">
            <Textarea rows={2} value={f.contacts} onChange={(e) => setF({ ...f, contacts: e.target.value })} placeholder="Client: Riya, +91 98…  · Location manager: …" />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Parking, wardrobe, references, permits…" />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button className={btn.primary} disabled={pending || !f.title.trim()} onClick={submit}>
          {pending ? "Saving…" : event ? "Save changes" : "Save event"}
        </button>
        <button className={btn.secondary} onClick={() => router.back()}>
          Cancel
        </button>
        {event && (
          <span className="ml-auto">
            <ConfirmButton
              size="md"
              confirm="Delete this event? People booked on it are taken off."
              confirmLabel="Delete event"
              onConfirm={() =>
                start(async () => {
                  const r = await deleteEvent(event.id);
                  if (!r.ok) return setMsg(r.message);
                  navigate(router, "/calendar");
                  router.refresh();
                })
              }
            >
              Delete event
            </ConfirmButton>
          </span>
        )}
        {msg && (
          <p className="text-sm text-danger" role="alert">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
