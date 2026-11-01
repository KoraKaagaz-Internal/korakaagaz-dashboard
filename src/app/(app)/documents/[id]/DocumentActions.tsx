"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelDocument,
  convertDocument,
  createCreditNote,
  deleteDraft,
  duplicateDocument,
  issueDocument,
  reviseQuote,
  sendBackToDraft,
  setQuoteOutcome,
  setRecurring,
  setReminders,
  setShare,
} from "@/app/actions/documents";
import { adjustAdvance, deletePayment, recordPayment } from "@/app/actions/payments";
import { markSent, sendDocumentEmail } from "@/app/actions/send";
import { NumberInput } from "@/components/NumberInput";
import { Card, ConfirmButton, Field, Input, Select, Textarea, btn } from "@/components/ui";
import { addMonths, formatInvoiceDate, formatMoney, round2 } from "@/lib/money";
import type { DocStatus, DocType, Payment, PaymentMode } from "@/lib/types";

interface DocSummary {
  id: string;
  doc_type: DocType;
  status: DocStatus;
  number: string | null;
  currency: string;
  balance: number;
  payment_status: string | null;
  share_enabled: boolean;
  reminders_enabled: boolean;
  recurring: { every: "month" | "quarter"; next: string } | null;
  client_email: string;
  client_id: string | null;
  /** taxable value ÷ total, so TDS can be worked out on the pre-GST part of the balance */
  taxable_ratio: number;
  total: number;
  client_name: string;
}

const DOC_WORD: Record<DocType, string> = { invoice: "invoice", quote: "quote", proforma: "proforma invoice", credit_note: "credit note", receipt: "receipt" };

type Outcome = { ok: boolean; message?: string } | void | undefined;

export function DocumentActions({
  doc,
  canEdit,
  isAdmin,
  shareUrl,
  email,
  whatsapp,
  payments,
  receipts,
  today,
}: {
  doc: DocSummary;
  canEdit: boolean;
  isAdmin: boolean;
  shareUrl: string;
  email: { subject: string; body: string };
  whatsapp: string;
  payments: Payment[];
  receipts: { id: string; number: string; total: number }[];
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<"" | "email" | "payment" | "decline">("");
  const issued = !["draft", "awaiting_approval", "cancelled"].includes(doc.status);
  const money = (n: number) => formatMoney(n, doc.currency);

  const run = (fn: () => Promise<Outcome>, success?: string) =>
    start(async () => {
      setMsg(null);
      try {
        const r = await fn();
        if (r && r.ok === false) setMsg({ ok: false, text: r.message ?? "Something went wrong" });
        else {
          if (success || (r && r.message)) setMsg({ ok: true, text: (r && r.message) || success! });
          router.refresh();
        }
      } catch (e) {
        // redirect() from a server action surfaces here as a NEXT_REDIRECT; let Next handle it
        if ((e as Error).message?.includes("NEXT_REDIRECT")) throw e;
        setMsg({ ok: false, text: (e as Error).message });
      }
    });

  return (
    <>
      <Card title="Actions">
        <div className="flex flex-wrap gap-2">
          {canEdit && doc.status === "draft" && (
            <>
              <Link href={`/documents/${doc.id}/edit`} className={btn.secondary}>
                Edit
              </Link>
              <ConfirmButton
                variant="primary"
                size="md"
                align="left"
                disabled={pending}
                confirm={`Issue this ${DOC_WORD[doc.doc_type]} for ${money(doc.total)}${doc.client_name ? ` to ${doc.client_name}` : ""}? It gets the next number and can't be edited after.`}
                confirmLabel="Issue"
                onConfirm={() => run(() => issueDocument(doc.id))}
              >
                Issue
              </ConfirmButton>
            </>
          )}
          {doc.status === "awaiting_approval" &&
            (isAdmin ? (
              <>
                <ConfirmButton
                  variant="primary"
                  size="md"
                  align="left"
                  disabled={pending}
                  confirm={`Approve and issue this ${DOC_WORD[doc.doc_type]} for ${money(doc.total)}? It gets the next number and can't be edited after.`}
                  confirmLabel="Approve and issue"
                  onConfirm={() => run(() => issueDocument(doc.id))}
                >
                  Approve and issue
                </ConfirmButton>
                <button className={btn.secondary} disabled={pending} onClick={() => run(() => sendBackToDraft(doc.id), "Sent back to draft")}>
                  Send back
                </button>
              </>
            ) : (
              <span className="text-sm text-violet-700">Waiting for the admin to approve.</span>
            ))}

          <a className={btn.secondary} href={`/api/documents/${doc.id}/pdf`}>
            Download PDF
          </a>

          {canEdit && issued && (
            <>
              <button className={btn.secondary} onClick={() => setPanel(panel === "email" ? "" : "email")}>
                Email
              </button>
              <a className={btn.secondary} href={whatsapp} target="_blank" rel="noreferrer" onClick={() => run(() => markSent(doc.id))}>
                WhatsApp
              </a>
            </>
          )}

          {canEdit && doc.doc_type === "invoice" && doc.status === "issued" && doc.balance > 0.005 && (
            <button className={btn.primary} onClick={() => setPanel(panel === "payment" ? "" : "payment")}>
              Record payment
            </button>
          )}

          {canEdit && doc.doc_type === "quote" && (doc.status === "issued" || doc.status === "accepted") && (
            <>
              <button className={btn.primary} disabled={pending} onClick={() => run(() => convertDocument(doc.id, "invoice"))}>
                Convert to invoice
              </button>
              <button className={btn.secondary} disabled={pending} onClick={() => run(() => convertDocument(doc.id, "proforma"))}>
                To proforma
              </button>
            </>
          )}
          {canEdit && doc.doc_type === "quote" && doc.status === "issued" && (
            <>
              <button className={btn.secondary} disabled={pending} onClick={() => run(() => setQuoteOutcome(doc.id, "accepted"), "Marked accepted")}>
                Mark accepted
              </button>
              <button className={btn.secondary} onClick={() => setPanel(panel === "decline" ? "" : "decline")}>
                Mark declined
              </button>
            </>
          )}
          {canEdit && doc.doc_type === "quote" && issued && (
            <button className={btn.ghost} disabled={pending} onClick={() => run(() => reviseQuote(doc.id))}>
              Revise
            </button>
          )}
          {canEdit && doc.doc_type === "proforma" && doc.status === "issued" && (
            <button className={btn.primary} disabled={pending} onClick={() => run(() => convertDocument(doc.id, "invoice"))}>
              Convert to tax invoice
            </button>
          )}
          {canEdit && doc.doc_type === "invoice" && doc.status === "issued" && (
            <button className={btn.ghost} disabled={pending} onClick={() => run(() => createCreditNote(doc.id))}>
              Credit note
            </button>
          )}
          {canEdit && (
            <button className={btn.ghost} disabled={pending} onClick={() => run(() => duplicateDocument(doc.id))}>
              Duplicate
            </button>
          )}
          {canEdit && doc.status === "issued" && (
            <ConfirmButton
              size="md"
              disabled={pending}
              confirm={`Cancel ${doc.number}? It stays in your records, marked cancelled.`}
              confirmLabel={`Cancel ${doc.number}`}
              onConfirm={() => run(() => cancelDocument(doc.id), "Cancelled")}
            >
              Cancel
            </ConfirmButton>
          )}
          {canEdit && (doc.status === "draft" || doc.status === "awaiting_approval") && (
            <ConfirmButton
              size="md"
              disabled={pending}
              confirm="Delete this draft? This can't be undone."
              confirmLabel="Delete draft"
              onConfirm={() => run(() => deleteDraft(doc.id))}
            >
              Delete draft
            </ConfirmButton>
          )}
        </div>
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
      </Card>

      {panel === "email" && (
        <EmailPanel
          defaults={{ to: doc.client_email, subject: email.subject, body: email.body }}
          onSend={(v) => run(() => sendDocumentEmail(doc.id, v).then((r) => (r.ok ? (setPanel(""), r) : r)))}
          pending={pending}
        />
      )}
      {panel === "payment" && (
        <PaymentPanel
          balance={doc.balance}
          taxableRatio={doc.taxable_ratio}
          currency={doc.currency}
          today={today}
          receipts={receipts}
          pending={pending}
          onRecord={(p) => run(() => recordPayment({ ...p, document_id: doc.id }).then((r) => (r.ok ? (setPanel(""), { ok: true, message: "Payment recorded" }) : r)))}
          onAdvance={(rid, amt) => run(() => adjustAdvance(doc.id, rid, amt).then((r) => (r.ok ? (setPanel(""), { ok: true, message: "Advance adjusted" }) : r)))}
        />
      )}
      {panel === "decline" && <DeclinePanel pending={pending} onDecline={(reason) => run(() => setQuoteOutcome(doc.id, "declined", reason), "Marked declined")} />}

      {payments.length > 0 && (
        <Card title="Payments">
          <ul className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="w-24 text-neutral-600">{formatInvoiceDate(p.paid_on)}</span>
                <span className="flex-1">
                  {money(p.amount)}
                  {p.tds_amount > 0 && (
                    <span className="text-neutral-500">
                      {" "}
                      + TDS {money(p.tds_amount)}
                      {p.tds_section ? ` (${p.tds_section})` : ""}
                    </span>
                  )}
                  <span className="block text-xs text-neutral-500">
                    {p.mode.toUpperCase()}
                    {p.reference && ` · ${p.reference}`}
                    {p.note && ` · ${p.note}`}
                  </span>
                </span>
                {canEdit && (
                  <ConfirmButton
                    disabled={pending}
                    confirm={`Delete this payment of ${money(p.amount)}? The balance goes back up.`}
                    confirmLabel="Delete payment"
                    onConfirm={() => run(() => deletePayment(p.id, doc.id), "Payment deleted")}
                  >
                    Delete
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {issued && (
        <Card title="Client link">
          <div className="space-y-3 text-sm">
            {doc.share_enabled ? (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                  <button className={btn.secondary} onClick={() => navigator.clipboard.writeText(shareUrl).then(() => setMsg({ ok: true, text: "Link copied" }))}>
                    Copy
                  </button>
                </div>
                <p className="text-xs text-neutral-500">
                  Anyone with this link can view and download this {doc.doc_type === "quote" ? "quote and accept it" : "document and pay by UPI"}. Nothing else is visible.
                </p>
              </>
            ) : (
              <p className="text-neutral-500">The client link is turned off.</p>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <button className={btn.ghost} disabled={pending} onClick={() => run(() => setShare(doc.id, !doc.share_enabled))}>
                  {doc.share_enabled ? "Turn link off" : "Turn link on"}
                </button>
                {doc.share_enabled && (
                  <button className={btn.ghost} disabled={pending} onClick={() => run(() => setShare(doc.id, true, true), "New link created; the old one no longer works")}>
                    Make a new link
                  </button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {canEdit && doc.doc_type === "invoice" && doc.status === "issued" && (
        <Card title="Follow-up">
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={doc.reminders_enabled} disabled={pending} onChange={(e) => run(() => setReminders(doc.id, e.target.checked))} />
              Automatic payment reminders by email
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!doc.recurring}
                disabled={pending}
                onChange={(e) => run(() => setRecurring(doc.id, e.target.checked ? "month" : null, e.target.checked ? addMonths(today, 1) : null))}
              />
              Recurring retainer {doc.recurring && `· next draft ${formatInvoiceDate(doc.recurring.next)} (${doc.recurring.every}ly)`}
            </label>
          </div>
        </Card>
      )}
    </>
  );
}

function EmailPanel({
  defaults,
  onSend,
  pending,
}: {
  defaults: { to: string; subject: string; body: string };
  onSend: (v: { to: string; cc: string; subject: string; body: string }) => void;
  pending: boolean;
}) {
  const [v, setV] = useState({ ...defaults, cc: "" });
  return (
    <Card title="Send by email (from team@korakaagaz.co)">
      <div className="space-y-3">
        <Field label="To">
          <Input value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />
        </Field>
        <Field label="CC">
          <Input value={v.cc} onChange={(e) => setV({ ...v, cc: e.target.value })} />
        </Field>
        <Field label="Subject">
          <Input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
        </Field>
        <Field label="Message">
          <Textarea rows={8} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        </Field>
        <p className="text-xs text-neutral-500">The PDF is attached. The message includes the client link.</p>
        <button className={btn.primary} disabled={pending} onClick={() => onSend(v)}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </Card>
  );
}

const MODES: { value: PaymentMode; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer (NEFT/IMPS/RTGS)" },
  { value: "wire", label: "International wire" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
];

function PaymentPanel({
  balance,
  taxableRatio,
  currency,
  today,
  receipts,
  pending,
  onRecord,
  onAdvance,
}: {
  balance: number;
  taxableRatio: number;
  currency: string;
  today: string;
  receipts: { id: string; number: string; total: number }[];
  pending: boolean;
  onRecord: (p: { paid_on: string; amount: number; tds_amount: number; tds_section: string; mode: PaymentMode; reference: string; note: string }) => void;
  onAdvance: (receiptId: string, amount: number) => void;
}) {
  const [p, setP] = useState({ paid_on: today, amount: balance, tds_amount: 0, tds_section: "", mode: "upi" as PaymentMode, reference: "", note: "" });
  const [receipt, setReceipt] = useState(receipts[0]?.id ?? "");
  const [advance, setAdvance] = useState(Math.min(balance, receipts[0]?.total ?? 0));

  // Client deducted TDS: amount received = balance − TDS (10% under s.194J by default).
  const applyTds = (rate: number) => {
    const tds = round2(balance * taxableRatio * (rate / 100)); // TDS is on the value before GST
    setP({ ...p, tds_amount: tds, tds_section: rate === 10 ? "194J" : rate === 2 ? "194J (technical)" : rate === 1 ? "194C" : "", amount: round2(balance - tds) });
  };

  return (
    <Card title={`Record payment · balance ${formatMoney(balance, currency)}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date received">
          <Input type="date" value={p.paid_on} onChange={(e) => setP({ ...p, paid_on: e.target.value })} />
        </Field>
        <Field label="Mode">
          <Select value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value as PaymentMode })}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Amount received (${currency})`}>
          <NumberInput min={0} value={p.amount} onValue={(n) => setP({ ...p, amount: n })} />
        </Field>
        <Field label="TDS deducted by client">
          <NumberInput min={0} value={p.tds_amount} onValue={(n) => setP({ ...p, tds_amount: n })} />
        </Field>
        <div className="flex flex-wrap items-center gap-1 text-xs sm:col-span-2">
          <span className="text-neutral-500">TDS shortcut:</span>
          <button type="button" className={btn.ghost} onClick={() => applyTds(10)}>
            10% · 194J professional
          </button>
          <button type="button" className={btn.ghost} onClick={() => applyTds(2)}>
            2% · technical
          </button>
          <button type="button" className={btn.ghost} onClick={() => applyTds(1)}>
            1% · 194C
          </button>
          <button type="button" className={btn.ghost} onClick={() => setP({ ...p, tds_amount: 0, tds_section: "", amount: balance })}>
            None
          </button>
        </div>
        <Field label="Reference (UTR / cheque no.)">
          <Input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} />
        </Field>
        <Field label="Note">
          <Input value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Leaves {formatMoney(Math.max(0, round2(balance - p.amount - p.tds_amount)), currency)} due. TDS is worked out on the value before GST; check it against Form 26AS.
      </p>
      <button className={`${btn.primary} mt-3`} disabled={pending} onClick={() => onRecord(p)}>
        Save payment
      </button>

      {receipts.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium">Or adjust an advance (receipt voucher)</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Select value={receipt} onChange={(e) => setReceipt(e.target.value)}>
              {receipts.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {formatMoney(r.total, currency)}
                </option>
              ))}
            </Select>
            <NumberInput min={0} value={advance} onValue={setAdvance} />
            <button className={btn.secondary} disabled={pending || !receipt} onClick={() => onAdvance(receipt, advance)}>
              Adjust
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DeclinePanel({ onDecline, pending }: { onDecline: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Card title="Why was it declined?">
      <div className="flex gap-2">
        <Input placeholder="Budget, timeline, went with someone else…" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={btn.secondary} disabled={pending} onClick={() => onDecline(reason)}>
          Save
        </button>
      </div>
    </Card>
  );
}
