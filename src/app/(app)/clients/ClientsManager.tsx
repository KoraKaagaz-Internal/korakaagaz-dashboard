"use client";

import { useState, useTransition } from "react";
import { deleteClient } from "@/app/actions";
import { ClientForm } from "@/components/ClientForm";
import { Card, btn } from "@/components/ui";
import type { Client } from "@/lib/types";

export function ClientsManager({ initial }: { initial: Client[] }) {
  const [clients, setClients] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();

  const upsert = (c: Client) => {
    setClients((list) => {
      const rest = list.filter((x) => x.id !== c.id);
      return [...rest, c].sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <Card title="New client">
          <ClientForm onSaved={upsert} onCancel={() => setEditing(null)} />
        </Card>
      ) : (
        <button className={btn.primary} onClick={() => setEditing("new")}>
          Add client
        </button>
      )}

      <Card>
        {clients.length === 0 && <p className="text-sm text-neutral-500">No clients yet.</p>}
        <ul className="divide-y divide-neutral-100">
          {clients.map((c) => (
            <li key={c.id} className="py-3">
              {editing === c.id ? (
                <ClientForm client={c} onSaved={upsert} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm whitespace-pre-line text-neutral-500">
                      {[c.address, c.gstin && `GSTIN ${c.gstin}`, c.email, c.phone].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button className={btn.ghost} onClick={() => setEditing(c.id)}>
                    Edit
                  </button>
                  <button
                    className={btn.danger}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Delete ${c.name}? Past invoices keep their copy of the client details.`)) return;
                      start(async () => {
                        await deleteClient(c.id);
                        setClients((l) => l.filter((x) => x.id !== c.id));
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
