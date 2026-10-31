"use client";

import { useState } from "react";
import { btn } from "@/components/ui";
import type { Lead } from "@/lib/crm";
import type { Person } from "@/lib/pm";
import { LeadForm } from "../LeadForm";

export function EditToggle({ lead, people, services, me }: { lead: Lead; people: Person[]; services: string[]; me: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className={btn.ghost} onClick={() => setOpen(true)}>
        Edit details
      </button>
    );
  return <LeadForm lead={lead} people={people} services={services} me={me} onDone={() => setOpen(false)} />;
}
