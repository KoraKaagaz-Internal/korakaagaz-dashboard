import Link from "next/link";
import { getSettings, requireTeam } from "@/lib/data";
import { cashAccounts, listCategories, listVendors } from "@/lib/expense-data";
import { todayIso } from "@/lib/money";
import { loggableProjects } from "@/lib/time-data";
import { ExpenseForm } from "../ExpenseForm";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ kind?: string; project?: string; vendor?: string }> }) {
  const { canEdit, isStaff } = await requireTeam();
  const sp = await searchParams;
  const [categories, vendors, projects, accounts, settings] = await Promise.all([
    listCategories(),
    listVendors(),
    loggableProjects(),
    isStaff ? cashAccounts() : Promise.resolve([]),
    isStaff ? getSettings() : Promise.resolve(null),
  ]);
  const kind = sp.kind === "bill" || sp.kind === "claim" ? sp.kind : "receipt";
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={canEdit ? "/expenses" : "/expenses/claims"} className="text-sm text-neutral-500 hover:text-navy">
          ← {canEdit ? "Expenses" : "My claims"}
        </Link>
        <h1 className="text-2xl font-semibold">{canEdit ? "New expense" : "New claim"}</h1>
      </div>
      <ExpenseForm
        expense={null}
        categories={categories}
        vendors={vendors}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        accounts={accounts}
        ourState={settings?.state_code ?? "21"}
        today={todayIso()}
        canEdit={canEdit}
        defaults={{ kind, project_id: sp.project, vendor_id: sp.vendor }}
      />
    </div>
  );
}
