"use client";

import { useState, useTransition } from "react";
import { myFeedToken } from "@/app/actions/calendar";
import { btn } from "@/components/ui";

/** Personal calendar subscription link (Google/Apple Calendar), with a way to reset it. */
export function FeedLink({ site }: { site: string }) {
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const load = (rotate: boolean) =>
    start(async () => {
      const r = await myFeedToken(rotate);
      if (!r.ok) return setMsg(r.message);
      setUrl(`${site}/api/ics/${r.token}.ics`);
      setMsg(rotate ? "New link made. The old one stopped working; subscribe again with this one." : "");
    });
  return (
    <div className="text-sm">
      {!url ? (
        <button className={btn.secondary} onClick={() => load(false)} disabled={pending}>
          Show my calendar link
        </button>
      ) : (
        <div className="space-y-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            aria-label="Calendar link"
            className="w-full rounded-lg border border-line bg-neutral-50 px-3 py-1.5 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button className={btn.secondary} onClick={() => navigator.clipboard.writeText(url).then(() => setMsg("Copied."))}>
              Copy
            </button>
            <button className={btn.ghost} onClick={() => load(true)} disabled={pending}>
              Make a new link
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            Google Calendar → Other calendars → + → From URL → paste. It shows your shoots, task due dates, approved leave and holidays, and refreshes every few hours. Anyone with
            the link can read it, so keep it private.
          </p>
        </div>
      )}
      {msg && (
        <p className="mt-1 text-xs text-neutral-600" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
