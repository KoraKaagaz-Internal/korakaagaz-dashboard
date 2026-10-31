"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addActivity, convertLead, deleteLead, moveLead } from "@/app/actions/crm";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { LOST_REASONS, STAGES, type Lead, type Stage } from "@/lib/crm";
import { addDays } from "@/lib/money";

export function StagePicker({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(lead.stage);
  const [reason, setReason] = useState(lead.lost_reason || LOST_REASONS[0]);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const go = (s: Stage, r = "") =>
    start(async () => {
      const res = await moveLead(lead.id, s, undefined, r);
      if (!res.ok) return setMsg(res.message);
      setMsg("");
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="!w-48"
        value={stage}
        disabled={pending}
        aria-label="Stage"
        onChange={(e) => {
          const s = e.target.value as Stage;
          setStage(s);
          if (s !== "lost" && s !== "won") go(s);
        }}
      >
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </Select>
      {stage === "lost" && lead.stage !== "lost" && (
        <>
          <Select className="!w-56" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why lost">
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <button className={btn.secondary} onClick={() => go("lost", reason)} disabled={pending}>
            Mark lost
          </button>
        </>
      )}
      {stage === "won" && lead.stage !== "won" && <span className="text-sm text-neutral-600">Use “Won: set up the client” below.</span>}
      {msg && <span className="text-sm text-red-700" role="alert">{msg}</span>}
    </div>
  );
}

const KINDS = [
  { key: "note", label: "Note" },
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
];

export function LogActivity({ leadId, followUp, today }: { leadId: string; followUp: string | null; today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("call");
  const [body, setBody] = useState("");
  const [next, setNext] = useState(followUp ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="What happened">
        {KINDS.map((k) => (
          <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)} className={`rounded-full px-3 py-1 text-xs ring-1 ${kind === k.key ? "bg-navy text-white ring-navy" : "bg-white text-neutral-700 ring-black/10"}`}>
            {k.label}
          </button>
        ))}
      </div>
      <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was said or agreed?" aria-label="Activity" />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Next follow-up">
          <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {[1, 3, 7].map((d) => (
          <button key={d} type="button" className={btn.ghost} onClick={() => setNext(addDays(today, d))}>
            +{d}d
          </button>
        ))}
        <button
          className={btn.primary}
          disabled={pending || (!body.trim() && next === (followUp ?? ""))}
          onClick={() =>
            start(async () => {
              const r = await addActivity(leadId, kind, body, next);
              if (!r.ok) return setMsg(r.message);
              setBody("");
              setMsg("");
              router.refresh();
            })
          }
        >
          Save
        </button>
      </div>
      {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}
    </div>
  );
}

export function Convert({ lead, templates, open }: { lead: Lead; templates: { id: string; name: string }[]; open: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(open);
  const [withProject, setWithProject] = useState(true);
  const [tpl, setTpl] = useState(templates.find((t) => lead.service && t.name.toLowerCase().includes(lead.service.toLowerCase().split(" ")[0]))?.id ?? "");
  const [name, setName] = useState(`${lead.company || lead.name}${lead.service ? ` · ${lead.service}` : ""}`);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (lead.client_id && lead.stage === "won") return null;
  if (!show)
    return (
      <button className={btn.primary} onClick={() => setShow(true)}>
        Won: set up the client
      </button>
    );
  return (
    <Card title="Won: set up the client">
      <p className="mb-3 text-sm text-neutral-600">Creates the client from this lead (or links an existing client with the same email), and a project to start work.</p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withProject} onChange={(e) => setWithProject(e.target.checked)} />
        Also start a project
      </label>
      {withProject && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Template">
            <Select value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Blank project</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await convertLead(lead.id, { create_project: withProject, template_id: tpl || null, project_name: name });
              if (!r.ok) return setMsg(r.message);
              router.refresh();
            })
          }
        >
          {pending ? "Setting up…" : "Mark won and set up"}
        </button>
        <button className={btn.ghost} onClick={() => setShow(false)}>
          Not yet
        </button>
        {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}
      </div>
    </Card>
  );
}

export function DeleteLead({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      className={btn.danger}
      disabled={pending}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        start(async () => {
          await deleteLead(id);
          router.push("/crm");
          router.refresh();
        });
      }}
    >
      {confirm ? "Click again to delete this lead" : "Delete lead"}
    </button>
  );
}

export function QuoteLink({ clientId }: { clientId: string }) {
  return (
    <Link href={`/documents/new?type=quote&client=${clientId}`} className={btn.secondary}>
      Create a quote
    </Link>
  );
}
