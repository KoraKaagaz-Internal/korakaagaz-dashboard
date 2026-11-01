"use client";

import { useState, useTransition } from "react";
import { respondToQuote } from "./actions";

export function QuoteResponse({ token }: { token: string }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="mb-5 rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok ring-1 ring-ok/20">
        {done === "accepted"
          ? "Thank you! The quote is accepted, and we'll be in touch."
          : done === "declined"
            ? "Thanks for letting us know."
            : "This quote can no longer be changed."}
      </div>
    );
  }
  const respond = (accept: boolean) => start(async () => setDone(await respondToQuote(token, accept, reason)));

  return (
    <div className="mb-5 rounded-xl bg-white p-4 border border-line">
      <p className="text-sm font-medium">Happy with this quote?</p>
      {declining ? (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            rows={2}
            placeholder="Optional: what should we change?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="rounded-lg border border-line px-4 py-2 text-sm" disabled={pending} onClick={() => respond(false)}>
              Decline quote
            </button>
            <button className="px-2 text-sm text-neutral-500" onClick={() => setDeclining(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white" disabled={pending} onClick={() => respond(true)}>
            Accept quote
          </button>
          <button className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
