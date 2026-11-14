"use client";

import { useState } from "react";
import { NumberInput } from "@/components/NumberInput";
import { Input, Select, btn } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { Person } from "@/lib/pm";
import { splitAmount } from "@/lib/projects";

/** One team-split row: who, and ₹ or % of the fee. Calls onAdd with the ₹ amount. */
export function SplitInput({ people, fee, onAdd, pending }: { people: Person[]; fee: number; onAdd: (s: { name: string; amount: number }) => void; pending?: boolean }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState(0);
  const [mode, setMode] = useState<"inr" | "pct">("inr");
  const amount = splitAmount(value, mode, fee);
  return (
    <div className="grid grid-cols-[1fr_96px_72px_auto] items-center gap-2">
      <Input list="split-people" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team member or freelancer" aria-label="Who" />
      <datalist id="split-people">
        {people.map((p) => (
          <option key={p.email} value={p.name || p.email} />
        ))}
      </datalist>
      <NumberInput value={value} onValue={setValue} min={0} aria-label={mode === "pct" ? "Percent of fee" : "Amount in ₹"} />
      <Select value={mode} onChange={(e) => setMode(e.target.value as "inr" | "pct")} aria-label="₹ or %">
        <option value="inr">₹</option>
        <option value="pct" disabled={!fee}>
          % fee
        </option>
      </Select>
      <button
        type="button"
        className={btn.secondary}
        disabled={pending || !name.trim() || !(amount > 0)}
        onClick={() => {
          onAdd({ name: name.trim(), amount });
          setName("");
          setValue(0);
        }}
      >
        Add{mode === "pct" && amount > 0 ? ` ${formatMoney(amount)}` : ""}
      </button>
    </div>
  );
}
