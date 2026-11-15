"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteClient } from "@/app/actions/catalog";
import { ClientForm } from "@/components/ClientForm";
import { Card, ConfirmButton, Input, btn } from "@/components/ui";
import { stateLabel } from "@/lib/gst";
import type { Client } from "@/lib/types";

export function ClientsManager({ initial, canEdit, isAdmin }: { initial: Client[]; canEdit: boolean; isAdmin: boolean }) {
  const [clients, setClients] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const upsert = (c: Client) => {
    setClients((list) => [...list.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
    setEditing(null);
  };
  const shown = clients.filter((c) => !q || `${c.name} ${c.email} ${c.gstin} ${c.city}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        {canEdit && editing !== "new" && (
          <button className={`${btn.primary} whitespace-nowrap`} onClick={() => setEditing("new")}>
            Add client
          </button>
        )}
      </div>
      {editing === "new" && (
        <Card title="New client">
          <ClientForm onSaved={upsert} onCancel={() => setEditing(null)} />
        </Card>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Card>
        {shown.length === 0 && <p className="text-sm text-neutral-500">No clients yet.</p>}
        <ul className="divide-y divide-line">
          {shown.map((c) => (
            <li key={c.id} className="py-3">
              {editing === c.id ? (
                <ClientForm client={c} onSaved={upsert} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:text-navy">
                      {c.name}
                    </Link>
                    <div className="text-sm text-neutral-500">
                      {[c.country !== "India" ? c.country : stateLabel(c.state_code), c.gstin && `GSTIN ${c.gstin}`, c.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Link href={`/clients/${c.id}`} className={btn.ghost}>
                    Ledger
                  </Link>
                  {canEdit && (
                    <>
                      <button className={btn.ghost} onClick={() => setEditing(c.id)}>
                        Edit
                      </button>
                      {isAdmin && (
                      <ConfirmButton
                        disabled={pending}
                        confirm={`Delete ${c.name}? Their documents keep a copy of the client details.`}
                        confirmLabel="Delete client"
                        onConfirm={() =>
                          start(async () => {
                            const r = await deleteClient(c.id);
                            if (r.ok) setClients((l) => l.filter((x) => x.id !== c.id));
                            else setError(r.message);
                          })
                        }
                      >
                        Delete
                      </ConfirmButton>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
