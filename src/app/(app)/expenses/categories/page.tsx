import { requireMember } from "@/lib/data";
import { listCategories } from "@/lib/expense-data";
import { SettingsHeader } from "../../settings/SettingsTabs";
import { CategoryEditor } from "./CategoryEditor";

export default async function CategoriesPage() {
  await requireMember("admin");
  const categories = await listCategories();
  return (
    <div className="space-y-5">
      <SettingsHeader
        current="/expenses/categories"
        subtitle="Each category sets the defaults on new expenses: GST credit, TDS, reverse charge. Check the rules with your CA once."
      />
      <CategoryEditor categories={categories} />
    </div>
  );
}
