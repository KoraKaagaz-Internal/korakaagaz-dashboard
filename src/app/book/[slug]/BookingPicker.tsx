"use client";

import { useState, useTransition } from "react";
import { bookCall } from "@/app/actions/crm";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy";
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function BookingPicker({ slug, days, minutes }: { slug: string; days: { date: string; slots: string[] }[]; minutes: number }) {
  const [day, setDay] = useState(days[0]?.date ?? "");
  const [slot, setSlot] = useState("");
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", note: "", website: "" });
  const [done, setDone] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (done)
    return (
      <div className="rounded-xl bg-white p-8 text-center border border-line" role="status">
        <h2 className="font-serif text-2xl text-navy">You&apos;re booked.</h2>
        <p className="mt-2 text-neutral-600">
          {done} (India time). A calendar invite is on its way to {f.email}.
        </p>
      </div>
    );
  if (!days.length) return <p className="rounded-xl bg-white p-6 text-neutral-600 border border-line">No free times in the next few weeks. Please email team@korakaagaz.co.</p>;
  const today = days.find((d) => d.date === day) ?? days[0];
  return (
    <div className="space-y-5 rounded-xl bg-white p-6 border border-line">
      <div>
        <h2 className="mb-2 text-sm font-semibold">1. Pick a day</h2>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Day">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-pressed={d.date === today.date}
              onClick={() => {
                setDay(d.date);
                setSlot("");
              }}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm ring-1 ${d.date === today.date ? "bg-navy text-white ring-navy" : "ring-black/10 hover:bg-neutral-50"}`}
            >
              {dayLabel(d.date)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">2. Pick a time ({minutes} min, India time)</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="Time">
          {today.slots.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={slot === s}
              onClick={() => setSlot(s)}
              className={`rounded-lg px-2 py-2 text-sm ring-1 ${slot === s ? "bg-navy text-white ring-navy" : "ring-black/10 hover:bg-neutral-50"}`}
            >
              {timeLabel(s)}
            </button>
          ))}
        </div>
      </div>
      {slot && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await bookCall({ slug, slot, ...f });
              if (!r.ok) return setMsg(r.message);
              setDone(r.when);
            });
          }}
        >
          <h2 className="text-sm font-semibold">3. Your details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              required
              placeholder="Your name *"
              aria-label="Your name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              autoComplete="name"
            />
            <input
              className={input}
              required
              type="email"
              placeholder="Email *"
              aria-label="Email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              autoComplete="email"
            />
            <input className={input} placeholder="Phone / WhatsApp" aria-label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
            <input
              className={input}
              placeholder="Brand / company"
              aria-label="Company"
              value={f.company}
              onChange={(e) => setF({ ...f, company: e.target.value })}
              autoComplete="organization"
            />
          </div>
          <textarea
            className={input}
            rows={3}
            placeholder="What would you like to talk about?"
            aria-label="Note"
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
          />
          <label className="absolute -left-[9999px]" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </label>
          {msg && (
            <p className="text-sm text-danger" role="alert">
              {msg}
            </p>
          )}
          <button disabled={pending} className="rounded-lg bg-navy px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "Booking…" : `Book ${dayLabel(today.date)}, ${timeLabel(slot)}`}
          </button>
        </form>
      )}
    </div>
  );
}
