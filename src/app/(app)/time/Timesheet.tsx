"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setCell, startTimer, submitWeek } from "@/app/actions/time";
import { Card, Select, btn } from "@/components/ui";
import { hhmm, isWeekend, parseDuration, weekDays, type TimeStatus } from "@/lib/time";

interface Entry {
  id: string;
  project_id: string;
  task_id: string | null;
  work_date: string;
  minutes: number;
  status: TimeStatus;
  timer_started_at: string | null;
  project_code: string;
  project_name: string;
  task_title: string;
}
interface Proj {
  id: string;
  code: string;
  name: string;
  tasks: { id: string; title: string }[];
}

const key = (p: string, t: string | null) => `${p}|${t ?? ""}`;
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function Timesheet({
  monday,
  entries,
  projects,
  today,
  canWork,
  approval,
}: {
  monday: string;
  entries: Entry[];
  projects: Proj[];
  today: string;
  canWork: boolean;
  approval: boolean;
}) {
  const router = useRouter();
  const days = weekDays(monday);
  const [extraRows, setExtraRows] = useState<{ project_id: string; task_id: string | null }[]>([]);
  const [pick, setPick] = useState({ project_id: "", task_id: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const rows = useMemo(() => {
    const map = new Map<string, { project_id: string; task_id: string | null; label: string; sub: string }>();
    const label = (p: string, t: string | null) => {
      const pr = projects.find((x) => x.id === p);
      const e = entries.find((x) => x.project_id === p && x.task_id === t);
      const task = t ? (pr?.tasks.find((x) => x.id === t)?.title ?? e?.task_title ?? "Task") : "General";
      return { label: task, sub: `${pr?.code ?? e?.project_code ?? ""} · ${pr?.name ?? e?.project_name ?? ""}` };
    };
    for (const e of entries) map.set(key(e.project_id, e.task_id), { project_id: e.project_id, task_id: e.task_id, ...label(e.project_id, e.task_id) });
    for (const r of extraRows) if (!map.has(key(r.project_id, r.task_id))) map.set(key(r.project_id, r.task_id), { ...r, ...label(r.project_id, r.task_id) });
    return [...map.values()];
  }, [entries, extraRows, projects]);

  const cell = (p: string, t: string | null, d: string) => {
    const es = entries.filter((e) => e.project_id === p && e.task_id === t && e.work_date === d);
    const draft = es.filter((e) => (e.status === "draft" || e.status === "rejected") && !e.timer_started_at).reduce((s, e) => s + e.minutes, 0);
    const locked = es.filter((e) => e.status === "submitted" || e.status === "approved").reduce((s, e) => s + e.minutes, 0);
    const running = es.some((e) => e.timer_started_at);
    const rejected = es.some((e) => e.status === "rejected");
    return { draft, locked, running, rejected };
  };

  const dayTotal = (d: string) => entries.filter((e) => e.work_date === d).reduce((s, e) => s + e.minutes, 0);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const drafts = entries.filter((e) => (e.status === "draft" || e.status === "rejected") && !e.timer_started_at && e.minutes > 0).length;

  const save = (p: string, t: string | null, d: string, text: string, current: number) => {
    const id = `${key(p, t)}|${d}`;
    const minutes = parseDuration(text);
    if (minutes === null || minutes > 1440) {
      setBad((b) => new Set(b).add(id));
      return;
    }
    setBad((b) => {
      const n = new Set(b);
      n.delete(id);
      return n;
    });
    if (minutes === current) return;
    start(async () => {
      const r = await setCell({ project_id: p, task_id: t, work_date: d, minutes });
      if (!r.ok) setMsg({ ok: false, text: r.message });
      router.refresh();
    });
  };

  const proj = projects.find((p) => p.id === pick.project_id);

  return (
    <div className="space-y-4">
      <Card>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-2 font-medium">Project / task</th>
                {days.map((d, i) => (
                  <th key={d} className={`w-20 text-center font-medium ${d === today ? "text-navy" : ""} ${isWeekend(d) ? "text-neutral-400" : ""}`}>
                    {DAY[i]}
                    <div className="font-normal">{shortDate(d)}</div>
                  </th>
                ))}
                <th className="w-16 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => {
                const rowTotal = entries.filter((e) => e.project_id === r.project_id && e.task_id === r.task_id).reduce((s, e) => s + e.minutes, 0);
                return (
                  <tr key={key(r.project_id, r.task_id)}>
                    <td className="py-1.5 pr-3">
                      <div className="max-w-64 truncate font-medium">{r.label}</div>
                      <div className="max-w-64 truncate text-xs text-neutral-500">{r.sub}</div>
                    </td>
                    {days.map((d) => {
                      const c = cell(r.project_id, r.task_id, d);
                      const id = `${key(r.project_id, r.task_id)}|${d}`;
                      return (
                        <td key={d} className="px-1 py-1.5 text-center">
                          <input
                            key={`${id}-${c.draft}`}
                            defaultValue={c.draft ? hhmm(c.draft) : ""}
                            disabled={!canWork || pending}
                            onBlur={(e) => save(r.project_id, r.task_id, d, e.target.value, c.draft)}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            aria-label={`${r.label}, ${d}`}
                            aria-invalid={bad.has(id) || undefined}
                            placeholder="–"
                            className={`w-16 rounded-md border px-1.5 py-1 text-center tabular-nums outline-none focus:border-navy ${bad.has(id) ? "border-red-500 bg-red-50" : c.rejected ? "border-amber-400 bg-amber-50" : "border-neutral-200"} ${isWeekend(d) ? "bg-neutral-50" : ""}`}
                          />
                          {(c.locked > 0 || c.running) && (
                            <div className="mt-0.5 text-[10px] text-neutral-500" title={c.running ? "Timer running" : "Submitted or approved"}>
                              {c.running ? "● timer" : `+${hhmm(c.locked)} sent`}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right font-medium tabular-nums">{hhmm(rowTotal)}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-neutral-500">
                    No time this week. Add a row below, or start a timer.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 text-xs text-neutral-600">
                <td className="py-2 font-medium">Day total</td>
                {days.map((d) => (
                  <td key={d} className={`text-center tabular-nums ${dayTotal(d) > 600 ? "font-semibold text-red-700" : ""}`}>
                    {dayTotal(d) ? hhmm(dayTotal(d)) : ""}
                  </td>
                ))}
                <td className="text-right text-sm font-semibold tabular-nums">{hhmm(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Type 1:30, 1.5, 90m or 2h.{approval ? " Amber cells were sent back by the admin: fix and submit again." : " Hours save as you type."}
        </p>
      </Card>

      {canWork && (
        <div className="flex flex-wrap items-end gap-2">
          <Select className="!w-64" value={pick.project_id} onChange={(e) => setPick({ project_id: e.target.value, task_id: "" })} aria-label="Project">
            <option value="">Project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
          <Select className="!w-64" value={pick.task_id} onChange={(e) => setPick({ ...pick, task_id: e.target.value })} disabled={!proj} aria-label="Task">
            <option value="">General (no task)</option>
            {proj?.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
          <button className={btn.secondary} disabled={!pick.project_id} onClick={() => setExtraRows((r) => [...r, { project_id: pick.project_id, task_id: pick.task_id || null }])}>
            Add row
          </button>
          <button
            className={btn.secondary}
            disabled={!pick.project_id || pending}
            onClick={() =>
              start(async () => {
                const r = await startTimer({ project_id: pick.project_id, task_id: pick.task_id || null });
                setMsg(r.ok ? { ok: true, text: "Timer started. Stop it from the bar at the top." } : { ok: false, text: r.message });
                router.refresh();
              })
            }
          >
            Start timer
          </button>
          {approval && (
            <div className="ml-auto">
              <button
                className={btn.primary}
                disabled={!drafts || pending}
                onClick={() =>
                  start(async () => {
                    const r = await submitWeek(monday);
                    setMsg(r.ok ? { ok: true, text: `Sent ${r.count} entr${r.count === 1 ? "y" : "ies"} for approval.` } : { ok: false, text: r.message });
                    router.refresh();
                  })
                }
              >
                Submit week for approval{drafts ? ` (${drafts})` : ""}
              </button>
            </div>
          )}
        </div>
      )}
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
