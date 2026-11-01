"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteAgreement, saveAgreement, sendAgreement } from "@/app/actions/agreements";
import { NumberInput } from "@/components/NumberInput";
import { AgreementBody, PriceTable } from "@/components/agreements/AgreementView";
import { Button, ConfirmButton, Field, InfoTip, Input, Section, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { unfilled, type Agreement, type PriceItem } from "@/lib/agreements";

type SignerDraft = { party: "client" | "studio" | "other"; name: string; email: string };
type Opt = { id: string; name: string };

export function AgreementEditor({
  agreement,
  signers: initialSigners,
  clients,
  projects,
  fields,
}: {
  agreement: Agreement;
  signers: SignerDraft[];
  clients: Opt[];
  projects: (Opt & { client_id: string | null })[];
  fields: { key: string; label: string }[];
}) {
  const router = useRouter();
  const initial = useMemo(
    () => ({
      title: agreement.title,
      body: agreement.body,
      items: agreement.items,
      gst_rate: agreement.gst_rate,
      message: agreement.message,
      expires_on: agreement.expires_on ?? "",
      starts_on: agreement.starts_on ?? "",
      ends_on: agreement.ends_on ?? "",
      renewal_notice_days: agreement.renewal_notice_days,
      client_id: agreement.client_id ?? "",
      project_id: agreement.project_id ?? "",
      signers: initialSigners,
    }),
    [agreement, initialSigners],
  );
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [view, setView] = useState<"write" | "preview">("write");
  const [pending, start] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(f) !== saved;
  const missing = unfilled(`${f.title}\n${f.body}`);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const payload = () => ({
    ...f,
    expires_on: f.expires_on || null,
    starts_on: f.starts_on || null,
    ends_on: f.ends_on || null,
    client_id: f.client_id || null,
    project_id: f.project_id || null,
  });
  const save = async () => {
    const r = await saveAgreement(agreement.id, payload());
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setSaved(JSON.stringify(f));
    return true;
  };
  const insertField = (key: string) => {
    const el = body.current;
    const token = `{{${key}}}`;
    if (!el) return setF({ ...f, body: f.body + token });
    const at = el.selectionStart ?? f.body.length;
    setF({ ...f, body: f.body.slice(0, at) + token + f.body.slice(el.selectionEnd ?? at) });
  };
  const setItem = (i: number, patch: Partial<PriceItem>) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setSigner = (i: number, patch: Partial<SignerDraft>) => setF({ ...f, signers: f.signers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Field label="Title">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-subtle p-0.5" role="group" aria-label="View">
              {(["write", "preview"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-sm ${view === v ? "bg-white font-medium shadow-sm" : "text-neutral-600"}`}
                >
                  {v === "write" ? "Write" : "Preview"}
                </button>
              ))}
            </div>
            {view === "write" && (
              <Select className="!h-8 !w-auto !py-1" value="" onChange={(e) => e.target.value && insertField(e.target.value)} aria-label="Insert a field">
                <option value="">+ Insert a field…</option>
                {fields.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {view === "write" ? (
            <>
              <Textarea
                ref={body}
                className="min-h-[480px] font-mono text-[13px] leading-relaxed"
                value={f.body}
                onChange={(e) => setF({ ...f, body: e.target.value })}
                aria-label="Document text"
              />
              <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                # Heading, ## Section, **bold**, *italic*, - bullet, 1. numbered.
                <InfoTip>Fields like {"{{client.name}}"} are filled when the draft is created. Anything shown as [field] still needs filling in before you can send.</InfoTip>
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
              <AgreementBody body={f.body} />
              {f.items.length > 0 && (
                <div className="mt-6">
                  <PriceTable items={f.items} gstRate={f.gst_rate} currency={agreement.currency} />
                </div>
              )}
            </div>
          )}
          {missing.length > 0 && <p className="mt-2 text-sm text-warn">Still to fill in: {missing.map((m) => `[${m}]`).join(", ")}</p>}
        </div>

        <Section
          title="Pricing"
          actions={
            <Button size="sm" variant="ghost" onClick={() => setF({ ...f, items: [...f.items, { title: "", description: "", amount: 0, optional: false, selected: true }] })}>
              + Add line
            </Button>
          }
        >
          {f.items.length === 0 ? (
            <p className="text-sm text-neutral-500">No pricing on this one. Add lines for a proposal; mark extras as optional and the client can tick them when signing.</p>
          ) : (
            <ul className="space-y-3">
              {f.items.map((it, i) => (
                <li key={i} className="grid grid-cols-[1fr_120px] gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input aria-label="Item" placeholder="Item" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                  <Input
                    aria-label="Description"
                    placeholder="What's included"
                    value={it.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <NumberInput aria-label="Amount" min={0} value={it.amount} onValue={(n) => setItem(i, { amount: n })} />
                  <div className="flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={it.optional} onChange={(e) => setItem(i, { optional: e.target.checked, selected: e.target.checked ? false : true })} />
                      Optional
                    </label>
                    <button type="button" className="text-danger hover:underline" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 max-w-40">
            <Field label="GST %">
              <NumberInput min={0} max={28} value={f.gst_rate} onValue={(n) => setF({ ...f, gst_rate: n })} />
            </Field>
          </div>
        </Section>
      </div>

      <aside className="space-y-8">
        <Section title="Signers">
          <ul className="space-y-3">
            {f.signers.map((s, i) => (
              <li key={i} className="space-y-1.5 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <Select className="!h-8 !w-auto !py-1" value={s.party} onChange={(e) => setSigner(i, { party: e.target.value as SignerDraft["party"] })} aria-label="Signs for">
                    <option value="client">Client</option>
                    <option value="studio">Studio</option>
                    <option value="other">Other</option>
                  </Select>
                  <span className="text-xs text-neutral-500">signs {i + 1}</span>
                  <button type="button" className="ml-auto text-xs text-danger hover:underline" onClick={() => setF({ ...f, signers: f.signers.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                </div>
                <Input aria-label="Signer name" placeholder="Full name" value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} />
                <Input aria-label="Signer email" type="email" placeholder="Email" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} />
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setF({ ...f, signers: [...f.signers, { party: "client", name: "", email: "" }] })}>
            + Add signer
          </Button>
          <p className="mt-1 text-xs text-neutral-500">Each signer gets their own link and confirms with a code sent to their email.</p>
        </Section>

        <Section title="Details">
          <div className="space-y-3">
            <Field label="Client">
              <Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
                <option value="">None</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}>
                <option value="">None</option>
                {projects
                  .filter((p) => !f.client_id || p.client_id === f.client_id || p.id === f.project_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Signing link open until">
              <Input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Starts">
                <Input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
              </Field>
              <Field label="Ends">
                <Input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
              </Field>
            </div>
            {f.ends_on && (
              <Field label="Remind me this many days before it ends">
                <NumberInput min={0} max={365} value={f.renewal_notice_days} onValue={(n) => setF({ ...f, renewal_notice_days: n })} />
              </Field>
            )}
            <Field label="Note in the email (optional)">
              <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Hi! Here's the proposal we discussed." />
            </Field>
          </div>
        </Section>

        <div className="sticky bottom-20 space-y-2 rounded-xl border border-line bg-white p-3 md:bottom-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !dirty}
              onClick={() =>
                start(async () => {
                  if (await save()) {
                    toast.success("Draft saved");
                    router.refresh();
                  }
                })
              }
            >
              {dirty ? "Save draft" : "Saved"}
            </Button>
            <ConfirmButton
              variant="primary"
              size="sm"
              align="left"
              disabled={pending || missing.length > 0 || !f.signers.length}
              confirm={`Send to ${f.signers.map((s) => s.name || s.email).join(", ")}? Each gets a link by email. After sending, the text can't be changed.`}
              confirmLabel="Send"
              onConfirm={() =>
                start(async () => {
                  if (dirty && !(await save())) return;
                  const r = await sendAgreement(agreement.id);
                  if (!r.ok) return void toast.error(r.message);
                  toast.success(
                    r.skipped ? `Sent, but email isn't working (${r.skipped}). Copy the links from the signers list.` : `Sent to ${r.emailed} signer${r.emailed === 1 ? "" : "s"}`,
                  );
                  router.refresh();
                })
              }
            >
              Send for signature
            </ConfirmButton>
            <ConfirmButton
              size="sm"
              disabled={pending}
              confirm="Delete this draft? This can't be undone."
              confirmLabel="Delete draft"
              onConfirm={() =>
                start(async () => {
                  const r = await deleteAgreement(agreement.id);
                  if (!r.ok) return void toast.error(r.message);
                  setSaved(JSON.stringify(f));
                  router.push("/agreements");
                })
              }
            >
              Delete
            </ConfirmButton>
          </div>
          {dirty && <p className="text-xs text-neutral-500">Unsaved changes</p>}
          {!f.signers.length && <p className="text-xs text-warn">Add at least one signer.</p>}
        </div>
      </aside>
    </div>
  );
}
