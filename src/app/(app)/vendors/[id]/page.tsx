import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, button } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { getVendor, listCategories, listExpenses } from "@/lib/expense-data";
import { financialYear, formatMoney, formatShortDate, todayIso } from "@/lib/money";
import { VendorForm } from "../VendorForm";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { canEdit } = await requireMember("admin");
  const { id } = await params;
  const [vendor, categories, expenses] = await Promise.all([getVendor(id), listCategories(), listExpenses({ vendor: id }, 2000)]);
  if (!vendor) notFound();
  const fy = financialYear(todayIso());
  const thisFy = expenses.filter((e) => e.expense_date >= `20${fy.slice(0, 2)}-04-01`);
  const sum = (k: "taxable" | "tds_amount" | "balance") => thisFy.reduce((s, e) => s + e[k], 0);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        back={{ href: "/vendors", label: "Vendors" }}
        title={vendor.name}
        subtitle={
          <>
            {vendor.gstin || "No GSTIN"}
            {vendor.pan ? ` · PAN ${vendor.pan}` : " · no PAN (TDS at 20%)"}
          </>
        }
        actions={
          <>
            {canEdit && (
              <Link href={`/expenses/new?kind=bill&vendor=${vendor.id}`} className={button("primary", "sm")}>
                New bill
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            [`Billed in FY ${fy} (before GST)`, sum("taxable")],
            ["TDS deducted this FY", sum("tds_amount")],
            ["Still owed", expenses.reduce((s, e) => s + e.balance, 0)],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white px-4 py-3 border border-line">
            <div className="text-xs text-neutral-500">{l}</div>
            <div className="text-xl font-semibold tabular-nums">{formatMoney(v)}</div>
          </div>
        ))}
      </div>
      <Card title="Bills and payments">
        {expenses.length ? (
          <ul className="divide-y divide-line text-sm">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link href={`/expenses/${e.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                  <span className="w-24 text-neutral-500">{formatShortDate(e.expense_date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.bill_no ? `${e.bill_no} · ` : ""}
                    {e.description || e.category}
                  </span>
                  {e.tds_amount > 0 && <span className="text-xs text-neutral-500">TDS {formatMoney(e.tds_amount)}</span>}
                  <span className="w-24 text-right tabular-nums">{formatMoney(e.total)}</span>
                  <span className={`w-24 text-right text-xs ${e.balance > 0.005 ? "font-medium text-warn" : "text-neutral-400"}`}>
                    {e.balance > 0.005 ? `owe ${formatMoney(e.balance)}` : "paid"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No bills yet.</p>
        )}
      </Card>
      {canEdit && <VendorForm vendor={vendor} categories={categories} />}
    </div>
  );
}
