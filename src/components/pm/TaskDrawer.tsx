"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { addComment, createTask, deleteComment, deleteTask, loadTask, setAssignees, updateTask } from "@/app/actions/projects";
import { startTimer } from "@/app/actions/time";
import { NumberInput } from "@/components/NumberInput";
import { ConfirmButton, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { PRIORITIES, TASK_STATUSES, displayName, type Person, type Task } from "@/lib/pm";
import { formatDateTime } from "@/lib/money";
import { hhmm } from "@/lib/time";
import type { TaskDetail } from "@/lib/pm-data";
import { Avatar } from "./Avatar";
import { Files } from "./Files";
import { PeoplePicker } from "./PeoplePicker";

/** Side panel for the task in ?task=<id>. Each field saves on change/blur. */
export function TaskDrawer({ people, canWork, me }: { people: Person[]; canWork: boolean; me: string }) {
  const params = useSearchParams();
  const id = params.get("task");
  const router = useRouter();
  const path = usePathname();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState("");
  const [comment, setComment] = useState("");
  const [sub, setSub] = useState("");
  const [pending, start] = useTransition();

  const reload = useCallback(async () => {
    if (!id) return;
    const d = await loadTask(id);
    setMissing(!d);
    setDetail(d);
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setMissing(false);
    setMsg("");
    reload();
  }, [reload]);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("task");
    const q = sp.toString();
    router.push(q ? `${path}?${q}` : path, { scroll: false });
  }, [params, path, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && id && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  if (!id) return null;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.message ?? "Something went wrong");
      else setMsg("");
      await reload();
      router.refresh();
    });

  const save = (patch: Partial<Task>) => detail && run(() => updateTask(detail.task.id, patch as Parameters<typeof updateTask>[1]));
  const t = detail?.task;
  const pickable = people.filter((p) => p.role !== "viewer");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t?.title ?? "Task"}>
      <button className="absolute inset-0 bg-black/20" onClick={close} aria-label="Close task" />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-3">
          {detail ? (
            <Link href={`/projects/${detail.project.id}`} className="text-sm text-neutral-500 hover:text-navy">
              {detail.project.code} · {detail.project.name}
            </Link>
          ) : (
            <span />
          )}
          <button onClick={close} className={btn.ghost}>
            Close
          </button>
        </div>

        {missing && <p className="p-5 text-sm text-neutral-500">This task was deleted or you don&apos;t have access.</p>}
        {!detail && !missing && <p className="p-5 text-sm text-neutral-500">Loading…</p>}

        {t && detail && (
          <div className="space-y-5 p-5">
            <input
              key={`title-${t.id}-${t.title}`}
              defaultValue={t.title}
              disabled={!canWork}
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && save({ title: e.target.value })}
              aria-label="Task title"
              className="w-full rounded-md border border-transparent px-1 text-xl font-semibold outline-none hover:border-neutral-200 focus:border-navy disabled:bg-white"
            />

            {canWork && (
              <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm">
                <button className={btn.secondary} disabled={pending} onClick={() => run(() => startTimer({ project_id: t.project_id, task_id: t.id }))}>
                  ▶ Start timer
                </button>
                <span className="text-neutral-600">
                  {detail.logged_minutes ? `${hhmm(detail.logged_minutes)} h logged` : "No time logged yet"}
                  {t.estimate_hours ? ` of ${t.estimate_hours} h estimated` : ""}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={t.status} disabled={!canWork} onChange={(e) => save({ status: e.target.value as Task["status"] })}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={t.priority} disabled={!canWork} onChange={(e) => save({ priority: e.target.value as Task["priority"] })}>
                  {PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start">
                <Input type="date" value={t.start_date ?? ""} disabled={!canWork} onChange={(e) => save({ start_date: e.target.value || null })} />
              </Field>
              <Field label="Due">
                <Input type="date" value={t.due_date ?? ""} disabled={!canWork} onChange={(e) => save({ due_date: e.target.value || null })} />
              </Field>
              <Field label="Phase">
                <Select value={t.phase_id ?? ""} disabled={!canWork} onChange={(e) => save({ phase_id: e.target.value || null })}>
                  <option value="">—</option>
                  {detail.phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimate (hours)">
                <EstimateInput key={`est-${t.id}-${t.estimate_hours}`} value={t.estimate_hours} disabled={!canWork} onSave={(v) => save({ estimate_hours: v })} />
              </Field>
              <div className="col-span-2">
                <span className="mb-1 block text-xs font-medium tracking-wide text-neutral-500 uppercase">Assignees</span>
                <PeoplePicker people={pickable} value={t.assignees} disabled={!canWork} onChange={(emails) => run(() => setAssignees(t.id, emails))} />
                {t.assignees.some((a) => !detail.members.includes(a)) && <p className="mt-1 text-xs text-neutral-500">Assigning someone adds them to the project.</p>}
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={t.client_visible} disabled={!canWork} onChange={(e) => save({ client_visible: e.target.checked })} />
                Client can see this task (client portal)
              </label>
            </div>

            <Field label="Notes">
              <Textarea
                key={`desc-${t.id}-${t.description.length}`}
                rows={4}
                defaultValue={t.description}
                disabled={!canWork}
                onBlur={(e) => e.target.value !== t.description && save({ description: e.target.value })}
                placeholder="Brief, references, specs…"
              />
            </Field>

            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Checklist{" "}
                {detail.subtasks.length > 0 && (
                  <span className="font-normal text-neutral-500">
                    · {detail.subtasks.filter((s) => s.status === "done").length}/{detail.subtasks.length}
                  </span>
                )}
              </h3>
              <ul className="space-y-1">
                {detail.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={s.status === "done"}
                      disabled={!canWork || pending}
                      onChange={() => run(() => updateTask(s.id, { status: s.status === "done" ? "todo" : "done" }))}
                      aria-label={`Done: ${s.title}`}
                    />
                    <span className={`flex-1 ${s.status === "done" ? "text-neutral-400 line-through" : ""}`}>{s.title}</span>
                    {canWork && (
                      <button className="text-xs text-neutral-400 hover:text-red-600" onClick={() => run(() => deleteTask(s.id))} aria-label={`Remove ${s.title}`}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canWork && (
                <input
                  value={sub}
                  onChange={(e) => setSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sub.trim()) {
                      const title = sub;
                      setSub("");
                      run(() => createTask(t.project_id, { title, parent_id: t.id, phase_id: t.phase_id }));
                    }
                  }}
                  placeholder="+ Add a checklist item, then Enter"
                  aria-label="Add checklist item"
                  className="mt-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-navy"
                />
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Files</h3>
              <Files projectId={t.project_id} taskId={t.id} files={detail.files} canWork={canWork} compact />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Comments</h3>
              <ul className="space-y-3">
                {detail.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar email={c.author_email} people={people} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-neutral-500">
                        <span className="font-medium text-neutral-800">{displayName(c.author_email, people)}</span> · {formatDateTime(c.created_at)}
                        {c.author_email === me && (
                          <ConfirmButton
                            className="ml-1 !h-6 !px-1.5 text-xs"
                            align="left"
                            confirm="Delete this comment?"
                            confirmLabel="Delete"
                            onConfirm={() => run(() => deleteComment(c.id))}
                          >
                            Delete
                          </ConfirmButton>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-neutral-800">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {canWork && (
                <div className="mt-3">
                  <Textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comment.trim()) {
                        const body = comment;
                        setComment("");
                        run(() => addComment(t.id, body));
                      }
                    }}
                    placeholder="Write a comment. @name to notify someone. Ctrl/⌘+Enter to send."
                    aria-label="Comment"
                  />
                  <button
                    className={`${btn.primary} mt-2`}
                    disabled={!comment.trim() || pending}
                    onClick={() => {
                      const body = comment;
                      setComment("");
                      run(() => addComment(t.id, body));
                    }}
                  >
                    Comment
                  </button>
                </div>
              )}
            </section>

            {msg && (
              <p className="text-sm text-red-700" role="alert">
                {msg}
              </p>
            )}

            {canWork && (
              <div className="border-t border-neutral-100 pt-4">
                <ConfirmButton
                  align="left"
                  confirm="Delete this task with its checklist, files and comments? This can't be undone."
                  confirmLabel="Delete task"
                  onConfirm={() =>
                    start(async () => {
                      const r = await deleteTask(t.id);
                      if (!r.ok) return setMsg(r.message);
                      close();
                      router.refresh();
                    })
                  }
                >
                  Delete task
                </ConfirmButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EstimateInput({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  return <NumberInput value={v} onValue={setV} min={0} step={0.5} disabled={disabled} onBlur={() => v !== value && onSave(v)} />;
}
