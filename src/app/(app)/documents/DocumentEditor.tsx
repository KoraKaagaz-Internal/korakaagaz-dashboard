"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { issueDocument, saveDocument } from "@/app/actions/documents";
import { saveItem } from "@/app/actions/catalog";
import { ClientForm } from "@/components/ClientForm";
import { NumberInput } from "@/components/NumberInput";
import { DocumentTemplate } from "@/components/invoice/DocumentTemplate";
import { ScaledPreview } from "@/components/invoice/ScaledPreview";
import { Card, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { OUTSIDE_INDIA, STATES, autoGstMode, stateLabel } from "@/lib/gst";
import { addDays, computeTotals, formatMoney } from "@/lib/money";
import { DOC_LABELS, type BankAccount, type CatalogItem, type Client, type DocumentDraft, type LineItem, type Project, type SupplierSnapshot } from "@/lib/types";

const TERMS = [
  { label: "Due on receipt", days: 0 },
  { label: "Net 7", days: 7 },
  { label: "Net 15", days: 15 },
  { label: "Net 30", days: 30 },
  { label: "Net 45", days: 45 },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

export function DocumentEditor({
  id,
  initial,
  clients: initialClients,
  items: initialCatalog,
  projects,
  banks,
  supplier,
  defaultSac,
  numberPreview,
}: {
  id?: string;
  initial: DocumentDraft;
  clients: Client[];
  items: CatalogItem[];
  projects: (Project & { client_name: string })[];
  banks: BankAccount[];
  supplier: SupplierSnapshot;
  defaultSac: string;
  numberPreview: string;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentDraft>(initial);
  const [clients, setClients] = useState(initialClients);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [addingClient, setAddingClient] = useState(false);
  const [autoTax, setAutoTax] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [fxNote, setFxNote] = useState("");
  const [pending, start] = useTransition();
  const label = DOC_LABELS[doc.doc_type];

  const set = <K extends keyof DocumentDraft>(k: K, v: DocumentDraft[K]) => setDoc((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<LineItem>) => setDoc((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const moveItem = (i: number, dir: -1 | 1) =>
    setDoc((p) => {
      const items = [...p.items];
      const j = i + dir;
      if (j < 0 || j >= items.length) return p;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...p, items };
    });

  const isExport = doc.place_of_supply === OUTSIDE_INDIA;

  // Tax follows place of supply unless the user overrides it.
  useEffect(() => {
    if (!autoTax) return;
    const mode = autoGstMode(supplier.state_code, doc.place_of_supply, doc.export_type);
    if (mode !== doc.gst_mode) setDoc((p) => ({ ...p, gst_mode: mode }));
  }, [autoTax, supplier.state_code, doc.place_of_supply, doc.export_type, doc.gst_mode]);

  const pickClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return set("client_id", null);
    applyClient(c);
  };
  const applyClient = (c: Client) => {
    const { id: cid, notes: _n, cc_emails: _c, ...snapshot } = c;
    void _n;
    void _c;
    const abroad = c.country && c.country !== "India";
    setDoc((p) => ({
      ...p,
      client_id: cid,
      client: snapshot,
      place_of_supply: abroad ? OUTSIDE_INDIA : c.state_code || p.place_of_supply,
      export_type: abroad ? (p.export_type === "none" ? (supplier.lut_number ? "lut" : "igst") : p.export_type) : "none",
      currency: abroad && p.currency === "INR" ? "USD" : !abroad ? "INR" : p.currency,
      fx_rate: !abroad ? 1 : p.fx_rate,
      project_id: projects.some((pr) => pr.id === p.project_id && pr.client_id === cid) ? p.project_id : null,
    }));
  };

  const addFromCatalog = (itemId: string) => {
    const it = catalog.find((c) => c.id === itemId);
    if (!it) return;
    const line: LineItem = { title: it.name, description: it.description, sac: it.sac || defaultSac, qty: 1, unit_price: it.unit_price };
    setDoc((p) => {
      const blank = p.items.length === 1 && !p.items[0].title && !p.items[0].unit_price;
      return { ...p, items: blank ? [line] : [...p.items, line] };
    });
  };

  const saveToCatalog = (i: number) =>
    start(async () => {
      const it = doc.items[i];
      const r = await saveItem({ name: it.title, description: it.description, sac: it.sac, unit_price: it.unit_price || 0 });
      if (r.ok) {
        setCatalog((c) => [...c, r.item].sort((a, b) => a.name.localeCompare(b.name)));
        setMessage({ ok: true, text: `Saved "${it.title}" to items` });
      } else setMessage({ ok: false, text: r.message });
    });

  const fetchFx = async () => {
    setFxNote("Fetching…");
    const res = await fetch(`/api/fx?currency=${doc.currency}`);
    const json = await res.json();
    if (res.ok) {
      set("fx_rate", Number(json.rate.toFixed(4)));
      setFxNote(`ECB reference rate for ${json.date}`);
    } else setFxNote(json.error);
  };

  const totals = useMemo(() => computeTotals(doc), [doc]);
  const money = (n: number) => formatMoney(n, doc.currency);
  const clientProjects = projects.filter((p) => !doc.client_id || p.client_id === doc.client_id);

  const save = (andIssue: boolean) =>
    start(async () => {
      setMessage(null);
      const result = await saveDocument({ ...doc, id });
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      if (andIssue) {
        const issued = await issueDocument(result.id);
        if (!issued.ok) {
          setMessage({ ok: false, text: issued.message });
          return router.push(`/documents/${result.id}/edit`);
        }
        return router.push(`/documents/${result.id}?flash=${encodeURIComponent(issued.message ?? "Issued")}`);
      }
      setMessage({ ok: true, text: "Draft saved" });
      if (!id) router.replace(`/documents/${result.id}/edit`);
      router.refresh();
    });

  // Ctrl/Cmd + Enter saves the draft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        save(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">{id ? `Edit ${label.short.toLowerCase()}` : `New ${label.short.toLowerCase()}`}</h1>
          <p className="text-sm text-neutral-500">
            Drafts can be edited freely. Issuing assigns the number ({doc.number || numberPreview}) and locks the {label.short.toLowerCase()}, as GST requires.
          </p>
        </div>

        <Card
          title={doc.doc_type === "receipt" ? "Received from" : "Billed to"}
          actions={
            !addingClient && (
              <button type="button" className={btn.ghost} onClick={() => setAddingClient(true)}>
                + New client
              </button>
            )
          }
        >
          {addingClient ? (
            <ClientForm
              onCancel={() => setAddingClient(false)}
              onSaved={(c) => {
                setClients((l) => [...l, c].sort((a, b) => a.name.localeCompare(b.name)));
                applyClient(c);
                setAddingClient(false);
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client" className="sm:col-span-2">
                <Select value={doc.client_id ?? ""} onChange={(e) => pickClient(e.target.value)}>
                  <option value="">Choose a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.country !== "India" ? ` (${c.country})` : c.state_code ? ` · ${STATES[c.state_code] ?? ""}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              {doc.client.name && (
                <p className="text-xs text-neutral-500 sm:col-span-2">
                  {[
                    doc.client.address,
                    doc.client.city,
                    doc.client.country !== "India" ? doc.client.country : stateLabel(doc.client.state_code),
                    doc.client.gstin && `GSTIN ${doc.client.gstin}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <Field label="Project (optional)">
                <Select value={doc.project_id ?? ""} onChange={(e) => set("project_id", e.target.value || null)}>
                  <option value="">None</option>
                  {clientProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!doc.client_id ? ` · ${p.client_name}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Place of supply">
                <Select value={doc.place_of_supply} onChange={(e) => set("place_of_supply", e.target.value)}>
                  <option value="">Choose…</option>
                  {Object.entries(STATES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </Card>

        <Card title="Details">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`${label.short} no.`}>
              <Input value={doc.number ?? ""} placeholder={`${numberPreview} (auto)`} onChange={(e) => set("number", e.target.value || null)} maxLength={16} />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={doc.issue_date}
                onChange={(e) => {
                  const issue = e.target.value;
                  const term = TERMS.find((t) => t.label === doc.payment_terms);
                  setDoc((p) => ({ ...p, issue_date: issue, due_date: term && p.doc_type === "invoice" ? addDays(issue, term.days) : p.due_date }));
                }}
              />
            </Field>
            {doc.doc_type === "quote" ? (
              <Field label="Valid until">
                <Input type="date" value={doc.valid_until ?? ""} onChange={(e) => set("valid_until", e.target.value || null)} />
              </Field>
            ) : doc.doc_type === "invoice" || doc.doc_type === "proforma" ? (
              <Field label="Due date">
                <Input type="date" value={doc.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
              </Field>
            ) : (
              <div />
            )}
            {(doc.doc_type === "invoice" || doc.doc_type === "proforma") && (
              <Field label="Payment terms">
                <Select
                  value={TERMS.some((t) => t.label === doc.payment_terms) ? doc.payment_terms : ""}
                  onChange={(e) => {
                    const term = TERMS.find((t) => t.label === e.target.value);
                    setDoc((p) => ({ ...p, payment_terms: e.target.value, due_date: term ? addDays(p.issue_date, term.days) : p.due_date }));
                  }}
                >
                  <option value="">Custom</option>
                  {TERMS.map((t) => (
                    <option key={t.label}>{t.label}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Currency">
              <Select value={doc.currency} onChange={(e) => setDoc((p) => ({ ...p, currency: e.target.value, fx_rate: e.target.value === "INR" ? 1 : p.fx_rate }))}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            {doc.currency !== "INR" && (
              <Field label={`INR per ${doc.currency}`}>
                <div className="flex gap-1">
                  <NumberInput min={0} value={doc.fx_rate} onValue={(n) => set("fx_rate", n || 1)} />
                  <button type="button" className={btn.secondary} onClick={fetchFx} title="Fetch today's reference rate">
                    Fetch
                  </button>
                </div>
                {fxNote && <span className="mt-1 block text-xs text-neutral-500">{fxNote}</span>}
              </Field>
            )}
            {banks.length > 1 && (
              <Field label="Bank account">
                <Select value={doc.bank_account_id ?? ""} onChange={(e) => set("bank_account_id", e.target.value || null)}>
                  <option value="">Default</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </Card>

        <Card
          title="Line items"
          actions={
            catalog.length > 0 && (
              <Select className="!w-auto" value="" onChange={(e) => addFromCatalog(e.target.value)} aria-label="Add from items">
                <option value="">+ From items…</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatMoney(c.unit_price)}
                  </option>
                ))}
              </Select>
            )
          }
        >
          <div className="space-y-3">
            {doc.items.map((item, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 p-3">
                <div className="mb-2 flex items-center gap-1 text-xs text-neutral-500">
                  <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ml-auto" />
                  {item.title && !catalog.some((c) => c.name === item.title) && (
                    <button type="button" className={btn.ghost} onClick={() => saveToCatalog(i)}>
                      Save to items
                    </button>
                  )}
                  <button type="button" className={btn.ghost} onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" className={btn.ghost} onClick={() => moveItem(i, 1)} disabled={i === doc.items.length - 1} aria-label="Move down">
                    ↓
                  </button>
                  <button
                    type="button"
                    className={btn.danger}
                    disabled={doc.items.length === 1}
                    onClick={() =>
                      set(
                        "items",
                        doc.items.filter((_, j) => j !== i),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_90px_70px_110px]">
                  <Input placeholder="Title" value={item.title} onChange={(e) => setItem(i, { title: e.target.value })} />
                  <Input placeholder="SAC" aria-label="SAC code" value={item.sac} onChange={(e) => setItem(i, { sac: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
                  <NumberInput min={0} aria-label="Quantity" value={item.qty} onValue={(n) => setItem(i, { qty: n })} />
                  <NumberInput min={0} aria-label="Unit price" value={item.unit_price} onValue={(n) => setItem(i, { unit_price: n })} />
                  <Textarea
                    className="sm:col-span-4"
                    placeholder="Description (deliverables, revisions included…)"
                    value={item.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <button type="button" className={btn.secondary} onClick={() => set("items", [...doc.items, { title: "", description: "", sac: defaultSac, qty: 1, unit_price: 0 }])}>
              + Add line item
            </button>
          </div>
        </Card>

        <Card title="Tax and discount">
          <div className="grid gap-3 sm:grid-cols-4">
            {isExport && (
              <Field label="Export" className="sm:col-span-2">
                <Select value={doc.export_type} onChange={(e) => set("export_type", e.target.value as DocumentDraft["export_type"])}>
                  <option value="lut">Under LUT, without IGST</option>
                  <option value="igst">With IGST (claim refund)</option>
                </Select>
              </Field>
            )}
            <Field label="GST">
              <Select
                value={doc.gst_mode}
                onChange={(e) => {
                  setAutoTax(false);
                  set("gst_mode", e.target.value as DocumentDraft["gst_mode"]);
                }}
              >
                <option value="none">No GST</option>
                <option value="cgst_sgst">CGST + SGST</option>
                <option value="igst">IGST</option>
              </Select>
            </Field>
            <Field label="Rate %">
              <NumberInput min={0} disabled={doc.gst_mode === "none"} value={doc.gst_rate} onValue={(n) => set("gst_rate", n)} />
            </Field>
            <Field label="Discount">
              <Select value={doc.discount_type} onChange={(e) => set("discount_type", e.target.value as DocumentDraft["discount_type"])}>
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="flat">Flat amount</option>
              </Select>
            </Field>
            <Field label="Value">
              <NumberInput min={0} disabled={doc.discount_type === "none"} value={doc.discount_value} onValue={(n) => set("discount_value", n)} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoTax} onChange={(e) => setAutoTax(e.target.checked)} />
              Set GST from place of supply
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={doc.round_off} onChange={(e) => set("round_off", e.target.checked)} />
              Round off total
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={doc.reverse_charge} onChange={(e) => set("reverse_charge", e.target.checked)} />
              Tax payable on reverse charge
            </label>
          </div>
          {isExport && doc.export_type === "lut" && !supplier.lut_number && (
            <p className="mt-2 text-xs text-amber-700">Add this year&apos;s LUT number in Settings so it prints on export invoices.</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-neutral-500">Taxable value</dt>
            <dd className="text-right tabular-nums">{money(totals.taxable)}</dd>
            {totals.tax > 0 && (
              <>
                <dt className="text-neutral-500">GST</dt>
                <dd className="text-right tabular-nums">{money(totals.tax)}</dd>
              </>
            )}
            <dt className="font-semibold text-navy">Total</dt>
            <dd className="text-right font-semibold text-navy tabular-nums">{money(totals.total)}</dd>
          </dl>
        </Card>

        <Card title="Notes, terms and extra fields">
          <div className="space-y-3">
            {doc.custom_fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                <Input
                  placeholder="Label (e.g. PO No.)"
                  value={f.label}
                  onChange={(e) =>
                    set(
                      "custom_fields",
                      doc.custom_fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  placeholder="Value"
                  value={f.value}
                  onChange={(e) =>
                    set(
                      "custom_fields",
                      doc.custom_fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className={btn.danger}
                  onClick={() =>
                    set(
                      "custom_fields",
                      doc.custom_fields.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {doc.custom_fields.length < 6 && (
              <button type="button" className={btn.ghost} onClick={() => set("custom_fields", [...doc.custom_fields, { label: "", value: "" }])}>
                + Add field (PO No., project code…)
              </button>
            )}
            <Field label="Notes (printed under the items)">
              <Textarea value={doc.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            <Field label="Terms">
              <Textarea value={doc.terms} onChange={(e) => set("terms", e.target.value)} />
            </Field>
          </div>
        </Card>

        {doc.doc_type === "invoice" && (
          <Card title="Follow-up">
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={doc.reminders_enabled} onChange={(e) => set("reminders_enabled", e.target.checked)} />
                Email payment reminders (3 days before, on the due date, then 7, 14 and 30 days after)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!doc.recurring}
                    onChange={(e) => set("recurring", e.target.checked ? { every: "month", next: addDays(doc.issue_date, 30) } : null)}
                  />
                  Repeat as a retainer: make a new draft every
                </label>
                {doc.recurring && (
                  <>
                    <Select className="!w-auto" value={doc.recurring.every} onChange={(e) => set("recurring", { ...doc.recurring!, every: e.target.value as "month" | "quarter" })}>
                      <option value="month">month</option>
                      <option value="quarter">quarter</option>
                    </Select>
                    starting
                    <Input className="!w-auto" type="date" value={doc.recurring.next} onChange={(e) => set("recurring", { ...doc.recurring!, next: e.target.value })} />
                  </>
                )}
              </div>
              <p className="text-xs text-neutral-500">Recurring drafts are never sent automatically: you review and issue each one.</p>
            </div>
          </Card>
        )}

        <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-black/5 bg-subtle/95 py-3 backdrop-blur">
          <button type="button" className={btn.secondary} disabled={pending} onClick={() => save(false)} title="Ctrl/Cmd + Enter">
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button type="button" className={btn.primary} disabled={pending} onClick={() => save(true)}>
            Save and issue
          </button>
          {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-auto">
        <ScaledPreview>
          <DocumentTemplate doc={{ ...doc, number: doc.number || numberPreview }} supplier={supplier} status="draft" />
        </ScaledPreview>
      </div>
    </div>
  );
}
