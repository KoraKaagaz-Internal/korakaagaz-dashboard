"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeRole, inviteMember, removeMember } from "@/app/actions/team";
import { Card, ConfirmButton, Input, Select, btn } from "@/components/ui";
import { formatInvoiceDate } from "@/lib/money";
import type { Member } from "@/lib/types";

type Assignable = "member" | "viewer" | "freelancer";

export function TeamManager({ members, me, mailReady }: { members: Member[]; me: string; mailReady: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Assignable>("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; invite?: string } | null>(null);
  const [pending, start] = useTransition();

  const invite = () =>
    start(async () => {
      const r = await inviteMember(email, role);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setEmail("");
      setMsg(
        r.result === "updated"
          ? { ok: true, text: "Role updated." }
          : r.mail === "sent"
            ? { ok: true, text: "Invited. They got an email from team@korakaagaz.co." }
            : { ok: true, text: "Invited. Email isn't set up yet, so send them this message yourself:", invite: r.inviteText },
      );
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card title="Invite someone">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-56 flex-1" type="email" placeholder="name@gmail.com or name@korakaagaz.co" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select className="!w-auto" value={role} onChange={(e) => setRole(e.target.value as Assignable)}>
            <option value="member">Member (create and send)</option>
            <option value="viewer">Viewer (read only)</option>
            <option value="freelancer">Freelancer (only their projects)</option>
          </Select>
          <button className={btn.primary} disabled={pending || !email.includes("@")} onClick={invite}>
            Invite
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          They must sign in with a Google account for exactly this email.{!mailReady && " Invite emails start once Gmail sending is set up (Settings → Email)."}
        </p>
        {msg && (
          <div className={`mt-3 text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>
            {msg.text}
            {msg.invite && (
              <div className="mt-2">
                <textarea readOnly rows={7} className="w-full rounded-lg border border-neutral-300 p-2 text-xs text-neutral-800" value={msg.invite} />
                <button className={btn.ghost} onClick={() => navigator.clipboard.writeText(msg.invite!)}>
                  Copy message
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title={`People · ${members.length}`}>
        <ul className="divide-y divide-neutral-100">
          {members.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {m.name || m.email}
                  {m.email === me && <span className="ml-2 text-xs text-neutral-400">you</span>}
                </div>
                <div className="text-xs text-neutral-500">
                  {m.name && `${m.email} · `}
                  {m.joined_at ? `joined ${formatInvoiceDate(m.joined_at)}` : `invited ${formatInvoiceDate(m.invited_at)}, hasn't signed in yet`}
                </div>
              </div>
              {m.role === "admin" ? (
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy">Admin</span>
              ) : (
                <>
                  <Select
                    className="!w-auto"
                    value={m.role}
                    disabled={pending}
                    onChange={(e) =>
                      start(async () => {
                        const r = await changeRole(m.email, e.target.value as Assignable);
                        if (!r.ok) setMsg({ ok: false, text: r.message });
                        router.refresh();
                      })
                    }
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                    <option value="freelancer">Freelancer</option>
                  </Select>
                  <ConfirmButton
                    disabled={pending}
                    confirm={m.joined_at ? `Remove ${m.email}? They're signed out immediately.` : `Cancel the invite for ${m.email}?`}
                    confirmLabel={m.joined_at ? "Remove" : "Cancel invite"}
                    onConfirm={() =>
                      start(async () => {
                        const r = await removeMember(m.email);
                        if (!r.ok) setMsg({ ok: false, text: r.message });
                        router.refresh();
                      })
                    }
                  >
                    {m.joined_at ? "Remove" : "Cancel invite"}
                  </ConfirmButton>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
