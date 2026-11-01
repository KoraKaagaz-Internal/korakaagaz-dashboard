"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBooking } from "@/app/actions/crm";
import { NumberInput } from "@/components/NumberInput";
import { Card, Field, Input, Textarea, btn } from "@/components/ui";
import type { BookingSettings } from "@/lib/crm";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingSettingsForm({ booking, services, site }: { booking: BookingSettings; services: string[]; site: string }) {
  const router = useRouter();
  const [b, setB] = useState(booking);
  const [svc, setSvc] = useState(services.join("\n"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const enquiryUrl = `${site}/enquire`;
  const embed = `<iframe src="${site}/enquire?embed=1" title="Start a project with Kora Kaagaz" style="width:100%;min-height:760px;border:0" loading="lazy"></iframe>`;
  const save = () =>
    start(async () => {
      const r = await saveBooking(b, svc.split("\n"));
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
      router.refresh();
    });
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => setMsg({ ok: true, text: "Copied." }));

  return (
    <div className="space-y-5">
      <Card title="Enquiry form">
        <p className="text-sm text-neutral-600">Anyone can fill this in. New enquiries arrive as leads with a follow-up tomorrow, and the studio is notified.</p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-neutral-100 px-2 py-1">{enquiryUrl}</code>
            <button className={btn.ghost} onClick={() => copy(enquiryUrl)}>
              Copy link
            </button>
            <a className={btn.ghost} href="/enquire" target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
          <p className="text-xs text-neutral-500">Add ?source=instagram (or referral, whatsapp, event) to links you share, to see where leads come from.</p>
          <Field label="Embed on korakaagaz.co (paste into the site)">
            <Textarea readOnly rows={3} value={embed} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          </Field>
          <button className={btn.ghost} onClick={() => copy(embed)}>
            Copy embed code
          </button>
          <Field label="Services in the form (one per line)">
            <Textarea rows={6} value={svc} onChange={(e) => setSvc(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Booking page for discovery calls">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} />
          Let people book a call (free times come from the studio calendar)
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Page address">
            <Input value={b.slug} onChange={(e) => setB({ ...b, slug: e.target.value })} />
          </Field>
          <Field label="Title">
            <Input value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} />
          </Field>
          <Field label="Length (minutes)">
            <NumberInput value={b.minutes} onValue={(v) => setB({ ...b, minutes: v })} min={15} max={240} />
          </Field>
          <Field label="From (IST)">
            <Input type="time" value={b.start} onChange={(e) => setB({ ...b, start: e.target.value })} />
          </Field>
          <Field label="Until (IST)">
            <Input type="time" value={b.end} onChange={(e) => setB({ ...b, end: e.target.value })} />
          </Field>
          <Field label="Gap around other events (min)">
            <NumberInput value={b.buffer} onValue={(v) => setB({ ...b, buffer: v })} min={0} />
          </Field>
          <Field label="Minimum notice (hours)">
            <NumberInput value={b.notice_hours} onValue={(v) => setB({ ...b, notice_hours: v })} min={0} />
          </Field>
          <Field label="Book up to (days ahead)">
            <NumberInput value={b.horizon_days} onValue={(v) => setB({ ...b, horizon_days: v })} min={1} max={90} />
          </Field>
          <Field label="Where">
            <Input value={b.location} onChange={(e) => setB({ ...b, location: e.target.value })} />
          </Field>
        </div>
        <fieldset className="mt-3">
          <legend className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">Days</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={b.days.includes(i)} onChange={(e) => setB({ ...b, days: e.target.checked ? [...b.days, i] : b.days.filter((x) => x !== i) })} />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        {b.enabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <code className="rounded bg-neutral-100 px-2 py-1">
              {site}/book/{b.slug}
            </code>
            <button className={btn.ghost} onClick={() => copy(`${site}/book/${b.slug}`)}>
              Copy link
            </button>
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Bookings create a meeting in the calendar, move the lead to “Discovery call”, and email both sides a calendar invite (once Gmail sending is set up).
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button className={btn.primary} disabled={pending} onClick={save}>
          Save
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`} role="status">
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
