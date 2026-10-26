import { listClients } from "@/lib/data";
import { ClientsManager } from "./ClientsManager";

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-semibold">Clients</h1>
      <ClientsManager initial={clients} />
    </div>
  );
}
