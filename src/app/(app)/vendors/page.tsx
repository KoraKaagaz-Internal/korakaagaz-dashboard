import Link from "next/link";
import { Card } from "@/components/ui";
import { requireMember } from "@/lib/data";
import { listCategories, listExpenses, listVendors } from "@/lib/expense-data";
import { tdsNature } from "@/lib/expenses";
import { financialYear, formatMoney, todayIso } from "@/lib/money";
import { ExpenseTabs } from "../expenses/Tabs";
import { VendorForm } from "./VendorForm";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { canEdit, isAdmin } = await requireMember();
  const sp = await searchParams;
  const fy = financialYear(todayIso());
  const [vendors, categories, expenses] = await Promise.all([listVendors(), listCategories(), listExpenses({ from: `20${fy.slice(0, 2)}-04-01` }, 5000)]);
  const spend = new Map<string, { total: number; owed: number }>();
  for (const e of expenses) {
    if (!e.vendor_id) continue;
    const s = spend.get(e.vendor_id) ?? { total: 0, owed: 0 };
    s.total += e.total * e.fx_rate;
    s.owed += e.balance;
    spend.set(e.vendor_id, s);
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Vendors</h1>
        <p className="text-sm text-neutral-500">Freelancers, rental houses, printers, landlords and software. GSTIN and PAN here drive GST credit and TDS on their bills.</p>
      </div>
      <ExpenseTabs current="/vendors" isAdmin={isAdmin} />
      {canEdit && (sp.new || !vendors.length) && <VendorForm categories={categories} />}
      {canEdit && !sp.new && vendors.length > 0 && (
        <Link href="/vendors?new=1" className="inline-block rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
          Add vendor
        </Link>
      )}
      {vendors.length > 0 && (
        <Card>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">Vendor</th>
                  <th className="font-medium">GSTIN</th>
                  <th className="font-medium">TDS</th>
                  <th className="text-right font-medium">Spent this FY</th>
                  <th className="text-right font-medium">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {vendors.map((v) => {
                  const s = spend.get(v.id);
                  return (
                    <tr key={v.id}>
                      <td className="py-2">
                        <Link href={`/vendors/${v.id}`} className="font-medium hover:text-navy">
                          {v.name}
                        </Link>
                        <span className="ml-2 text-xs text-neutral-500 capitalize">{v.kind}</span>
                        {v.msme && <span className="ml-2 rounded bg-amber-50 px-1 text-xs text-amber-800">MSME</span>}
                      </td>
                      <td className="font-mono text-xs text-neutral-600">{v.gstin || "—"}</td>
                      <td className="text-xs text-neutral-600">{v.tds_nature === "none" ? "—" : tdsNature(v.tds_nature).label.split(" ·")[0]}</td>
                      <td className="text-right tabular-nums">{formatMoney(s?.total ?? 0)}</td>
                      <td className={`text-right tabular-nums ${(s?.owed ?? 0) > 0.005 ? "font-medium" : "text-neutral-400"}`}>{formatMoney(s?.owed ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
