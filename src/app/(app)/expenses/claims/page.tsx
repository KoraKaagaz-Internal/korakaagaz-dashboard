import Link from "next/link";
import { Card, PageHeader, button } from "@/components/ui";
import { requireTeam } from "@/lib/data";
import { cashAccounts, listExpenses } from "@/lib/expense-data";
import { formatInvoiceDate, formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { teamDirectory } from "@/lib/pm-data";
import { ExpenseTabs } from "../Tabs";
import { ClaimsAdmin } from "./ClaimsAdmin";

export default async function ClaimsPage() {
  const { isAdmin, isStaff, email, role } = await requireTeam();
  const [claims, people, accounts] = await Promise.all([listExpenses({ kind: "claim" }, 500), teamDirectory(), isAdmin ? cashAccounts() : Promise.resolve([])]);
  const names = Object.fromEntries(people.map((p) => [p.email, p.name]));
  const mine = claims.filter((c) => c.created_by === email);
  const row = (c: (typeof claims)[number]) => ({
    id: c.id,
    created_by: c.created_by,
    expense_date: c.expense_date,
    description: c.description,
    vendor: c.vendor,
    category: c.category,
    total: c.total,
    balance: c.balance,
    receipt: !!c.receipt_path,
  });
  const status = (c: (typeof claims)[number]) =>
    c.approval === "submitted"
      ? "Waiting approval"
      : c.approval === "rejected"
        ? `Sent back${c.approval_note ? `: ${c.approval_note}` : ""}`
        : c.balance <= 0.005
          ? `Reimbursed${c.last_paid_on ? ` ${formatInvoiceDate(c.last_paid_on)}` : ""}`
          : "Approved, to be paid";

  return (
    <div className="space-y-5">
      <PageHeader
        title={isAdmin ? "Expenses" : "My claims"}
        subtitle="Spent your own money on studio work? File a claim with the receipt and get reimbursed."
        actions={
          <>
            {role !== "viewer" && (
              <Link href="/expenses/new?kind=claim" className={button("primary", "sm")}>
                New claim
              </Link>
            )}
          </>
        }
        tabs={isStaff ? <ExpenseTabs current="/expenses/claims" isAdmin={isAdmin} /> : undefined}
      />

      {isAdmin && (
        <ClaimsAdmin
          pending={claims.filter((c) => c.approval === "submitted").map(row)}
          approved={claims.filter((c) => c.approval === "approved" && c.balance > 0.005).map(row)}
          names={names}
          accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
          today={todayIso()}
        />
      )}

      <Card title={isAdmin ? "All claims" : "My claims"}>
        {(isAdmin ? claims : mine).length ? (
          <ul className="divide-y divide-line text-sm">
            {(isAdmin ? claims : mine).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 text-neutral-500">{formatShortDate(c.expense_date)}</span>
                {isAdmin && <span className="w-28 truncate">{names[c.created_by] || c.created_by.split("@")[0]}</span>}
                <Link href={`/expenses/${c.id}`} className="min-w-0 flex-1 truncate hover:text-navy">
                  {c.description || c.vendor || c.category}
                </Link>
                <span className={`text-xs ${c.approval === "rejected" ? "text-warn" : "text-neutral-500"}`}>{status(c)}</span>
                <span className="w-24 text-right tabular-nums">{formatMoney(c.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No claims yet.</p>
        )}
      </Card>
    </div>
  );
}
