import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getSettings, requireTeam } from "@/lib/data";
import { cashAccounts, getExpense, listCategories, listVendors } from "@/lib/expense-data";
import { tdsNature } from "@/lib/expenses";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { loggableProjects } from "@/lib/time-data";
import { ExpenseForm } from "../ExpenseForm";
import { Danger, Payments, ReceiptButton } from "./ExpenseActions";

export default async function ExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { canEdit, isAdmin, isStaff, email } = await requireTeam();
  const { id } = await params;
  const { edit } = await searchParams;
  const found = await getExpense(id);
  if (!found) notFound();
  const { expense: e, payments } = found;
  const mine = e.created_by === email;
  const editable = canEdit || (mine && e.kind === "claim" && e.approval !== "approved");
  const back = isStaff ? "/expenses" : "/expenses/claims";
  const today = todayIso();

  if (edit && editable) {
    const [categories, vendors, projects, accounts, settings] = await Promise.all([
      listCategories(),
      listVendors(),
      loggableProjects(),
      isStaff ? cashAccounts() : Promise.resolve([]),
      isStaff ? getSettings() : Promise.resolve(null),
    ]);
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href={`/expenses/${id}`} className="text-sm text-neutral-500 hover:text-navy">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold">Edit expense</h1>
        <ExpenseForm
          expense={e}
          categories={categories}
          vendors={vendors}
          projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
          accounts={accounts}
          ourState={settings?.state_code ?? "21"}
          today={today}
          canEdit={canEdit}
        />
      </div>
    );
  }

  const accounts = isStaff ? await cashAccounts() : [];
  const gst = e.cgst + e.sgst + e.igst;
  const canPay = e.kind === "claim" ? isAdmin && e.approval === "approved" : canEdit;
  const rows: [string, React.ReactNode][] = [
    ["Type", e.kind === "claim" ? `Team claim by ${e.created_by}` : e.kind === "bill" ? "Bill to pay" : "Paid expense"],
    [
      "Paid to",
      e.vendor_id && isStaff ? (
        <Link href={`/vendors/${e.vendor_id}`} className="text-navy hover:underline">
          {e.vendor}
        </Link>
      ) : (
        e.vendor || "—"
      ),
    ],
    ["Category", e.category],
    ["Date", formatInvoiceDate(e.expense_date)],
    ["Bill no.", e.bill_no || "—"],
    [
      "Project",
      e.project_id ? (
        <Link href={`/projects/${e.project_id}`} className="text-navy hover:underline">
          {e.project_code}
        </Link>
      ) : (
        "Studio overhead"
      ),
    ],
    ["Taxable value", formatMoney(e.taxable, e.currency)],
    ["GST", gst ? `${formatMoney(gst)} (${e.igst ? "IGST" : "CGST + SGST"} @ ${e.gst_rate}%)${e.rcm ? " · reverse charge" : ""}` : "None"],
    [
      "Input credit",
      gst ? (e.itc_status === "eligible" ? `Claimable · GSTR-2B: ${e.gstr2b.replace("_", " ")}` : e.itc_status === "blocked" ? "Blocked (s.17(5))" : "Not claimable") : "—",
    ],
    ...(e.tds_amount
      ? ([["TDS deducted", `${formatMoney(e.tds_amount)} · ${tdsNature(e.tds_nature).label}${e.tds_challan_id ? " · deposited" : " · not yet deposited"}`]] as [
          string,
          React.ReactNode,
        ][])
      : []),
    ["Total", <b key="t">{formatMoney(e.total, e.currency)}</b>],
    ...(e.kind === "bill" ? ([["Due", e.due_date ? formatInvoiceDate(e.due_date) : "—"]] as [string, React.ReactNode][]) : []),
    ...(e.billable
      ? ([
          [
            "Re-bill",
            e.invoiced_document_id ? (
              <Link key="i" href={`/documents/${e.invoiced_document_id}`} className="text-navy hover:underline">
                On an invoice
              </Link>
            ) : (
              `Waiting to bill${e.markup_pct ? ` (+${e.markup_pct}% markup)` : ""}`
            ),
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(e.recurring ? ([["Repeats", `Every ${e.recurring.every}, next ${formatInvoiceDate(e.recurring.next)}`]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={back} className="text-sm text-neutral-500 hover:text-navy">
            ← {isStaff ? "Expenses" : "My claims"}
          </Link>
          <h1 className="text-2xl font-semibold">{e.description || e.vendor || e.category}</h1>
          <p className="text-sm text-neutral-500">
            {e.is_draft
              ? "Draft from a recurring expense: confirm it below"
              : e.kind === "claim" && e.approval !== "approved"
                ? e.approval === "submitted"
                  ? "Waiting for the admin's approval"
                  : `Sent back${e.approval_note ? `: ${e.approval_note}` : ""}`
                : e.balance <= 0.005
                  ? `Paid in full${e.last_paid_on ? ` on ${formatInvoiceDate(e.last_paid_on)}` : ""}`
                  : `${formatMoney(e.balance)} still to pay`}
          </p>
        </div>
        <div className="flex gap-2">
          {e.receipt_path && <ReceiptButton id={e.id} name={e.receipt_name} />}
          {editable && (
            <Link href={`/expenses/${id}?edit=1`} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
              Edit
            </Link>
          )}
        </div>
      </div>

      <Card>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {e.notes && <p className="mt-3 text-sm whitespace-pre-wrap text-neutral-700">{e.notes}</p>}
      </Card>

      {(e.kind !== "claim" || e.approval === "approved") && (
        <Card title={`Payments · ${formatMoney(e.paid)} of ${formatMoney(e.payable)}`}>
          <Payments expenseId={e.id} balance={e.balance} payments={payments} accounts={accounts} canPay={canPay} today={today} />
        </Card>
      )}

      <Danger id={e.id} isDraft={e.is_draft && canEdit} canDelete={editable && payments.length === 0 && !e.invoiced_document_id} back={back} />
    </div>
  );
}
