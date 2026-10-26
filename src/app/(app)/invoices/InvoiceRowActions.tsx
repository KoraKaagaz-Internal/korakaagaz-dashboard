"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteInvoice, duplicateInvoice, setInvoiceStatus } from "@/app/actions";
import { btn } from "@/components/ui";
import type { InvoiceStatus } from "@/lib/types";

export function InvoiceRowActions({ id, number, status }: { id: string; number: string; status: InvoiceStatus }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-1 whitespace-nowrap">
      <Link href={`/invoices/${id}/edit`} className={btn.ghost}>
        Open
      </Link>
      <a href={`/api/invoices/${id}/pdf`} className={btn.ghost}>
        PDF
      </a>
      <button className={btn.ghost} disabled={pending} onClick={() => start(() => duplicateInvoice(id))}>
        Duplicate
      </button>
      {status !== "paid" ? (
        <button className={btn.ghost} disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "paid"))}>
          Mark paid
        </button>
      ) : (
        <button className={btn.ghost} disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "sent"))}>
          Mark unpaid
        </button>
      )}
      {status === "draft" && (
        <button className={btn.ghost} disabled={pending} onClick={() => start(() => setInvoiceStatus(id, "sent"))}>
          Mark sent
        </button>
      )}
      <button
        className={btn.danger}
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Delete invoice ${number}? This cannot be undone.`)) start(() => deleteInvoice(id));
        }}
      >
        Delete
      </button>
    </div>
  );
}
