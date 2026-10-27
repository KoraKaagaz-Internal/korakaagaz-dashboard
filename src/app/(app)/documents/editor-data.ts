import "server-only";
import { getSettings, listBankAccounts, listClients, listItems, listProjects, supplierSnapshot } from "@/lib/data";
import { financialYear } from "@/lib/money";
import type { DocType } from "@/lib/types";

export async function editorData(docType: DocType, issueDate: string, bankId: string | null) {
  const [settings, banks, clients, items, projects] = await Promise.all([getSettings(), listBankAccounts(), listClients(), listItems(), listProjects()]);
  const bank = banks.find((b) => b.id === bankId) ?? banks.find((b) => b.is_default) ?? banks[0] ?? null;
  return {
    settings,
    banks,
    clients,
    items,
    projects,
    supplier: supplierSnapshot(settings, bank),
    numberPreview: `${settings.prefixes[docType]}/${financialYear(issueDate)}/###`,
  };
}
