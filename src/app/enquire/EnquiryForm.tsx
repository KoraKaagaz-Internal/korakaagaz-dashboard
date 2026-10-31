"use client";

import { useEffect, useState, useTransition } from "react";
import { submitEnquiry } from "@/app/actions/crm";

const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#081788]";

export function EnquiryForm({ services, source, bookingUrl }: { services: string[]; source: string; bookingUrl: string | null }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", service: "", budget: "", message: "", website: "" });
  const [opened, setOpened] = useState(0);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => setOpened(Date.now()), []);

  if (done)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5" role="status">
        <h2 className="font-serif text-2xl text-[#081788]">Thank you, {f.name.split(" ")[0]}.</h2>
        <p className="mt-2 text-neutral-600">We&apos;ve got your message and will get back to you within a working day.</p>
        {bookingUrl && (
          <a href={bookingUrl} target="_top" className="mt-5 inline-block rounded-lg bg-[#081788] px-4 py-2 text-sm font-medium text-white">
            Pick a time for a quick call
          </a>
        )}
      </div>
    );

  const label = (t: string, req = false) => (
    <span className="mb-1 block text-xs font-medium tracking-wide text-neutral-600 uppercase">
      {t}
      {req && <span aria-hidden="true"> *</span>}
    </span>
  );
  return (
    <form
      className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitEnquiry({ ...f, source, opened_at: opened });
          if (!r.ok) return setMsg(r.message);
          setDone(true);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          {label("Your name", true)}
          <input className={input} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </label>
        <label className="block">
          {label("Email", true)}
          <input className={input} required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </label>
        <label className="block">
          {label("Phone / WhatsApp")}
          <input className={input} type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
        </label>
        <label className="block">
          {label("Brand / company")}
          <input className={input} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} autoComplete="organization" />
        </label>
        <label className="block">
          {label("What do you need?")}
          <select className={input} value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>
            <option value="">Choose…</option>
            {services.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          {label("Budget (roughly)")}
          <select className={input} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })}>
            <option value="">Not sure yet</option>
            <option>Under ₹50,000</option>
            <option>₹50,000 – ₹1 lakh</option>
            <option>₹1 – 3 lakh</option>
            <option>₹3 – 10 lakh</option>
            <option>Over ₹10 lakh</option>
          </select>
        </label>
      </div>
      <label className="block">
        {label("Tell us about the project", true)}
        <textarea className={input} required rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="What you're making, for whom, and when you'd like it." />
      </label>
      {/* hidden from people; bots fill it in */}
      <label className="absolute -left-[9999px]" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
      </label>
      {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}
      <button disabled={pending} className="rounded-lg bg-[#081788] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Sending…" : "Send enquiry"}
      </button>
      <p className="text-xs text-neutral-500">We only use your details to reply to you.</p>
    </form>
  );
}
