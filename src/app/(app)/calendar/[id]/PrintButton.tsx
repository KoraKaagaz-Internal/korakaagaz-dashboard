"use client";

import { btn } from "@/components/ui";

export function PrintButton() {
  return (
    <button className={btn.secondary} onClick={() => window.print()}>
      Print / save PDF
    </button>
  );
}
