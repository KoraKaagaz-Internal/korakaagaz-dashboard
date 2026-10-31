import { requireMember } from "@/lib/data";
import { listCategories } from "@/lib/expense-data";
import { ExpenseTabs } from "../Tabs";
import { CategoryEditor } from "./CategoryEditor";

export default async function CategoriesPage() {
  await requireMember("admin");
  const categories = await listCategories();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Expense categories</h1>
        <p className="text-sm text-neutral-500">Each category sets the defaults on new expenses: GST credit, TDS, reverse charge. Check the GST and TDS rules with your CA once.</p>
      </div>
      <ExpenseTabs current="/expenses/categories" isAdmin />
      <CategoryEditor categories={categories} />
    </div>
  );
}
