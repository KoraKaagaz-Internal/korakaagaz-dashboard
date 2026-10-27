import { describe, expect, it } from "vitest";
import { ageing, kpis, revenueByMonth } from "./reports";
import type { DocumentRecord } from "./types";

const doc = (o: Partial<DocumentRecord>): DocumentRecord =>
  ({
    doc_type: "invoice", status: "issued", currency: "INR", fx_rate: 1, issue_date: "2026-10-01", due_date: "2026-10-08",
    taxable: 10000, total: 11800, fy: "26-27", balance: { paid: 0, tds: 0, credited: 0, balance: 11800, payment_status: "unpaid", overdue: false },
    ...o,
  }) as DocumentRecord;

describe("ageing", () => {
  it("buckets by days past due", () => {
    const rows = ageing(
      [
        doc({ due_date: "2026-11-01" }), // not due
        doc({ due_date: "2026-10-20" }), // 7 days late
        doc({ due_date: "2026-07-01" }), // 118 days
        doc({ balance: { paid: 11800, tds: 0, credited: 0, balance: 0, payment_status: "paid", overdue: false } }),
      ],
      "2026-10-27",
    );
    expect(rows.map((r) => r.count)).toEqual([1, 1, 0, 0, 1]);
    expect(rows[4].value).toBe(11800);
  });
});

describe("revenueByMonth", () => {
  it("counts issued invoices minus credit notes, in INR", () => {
    const rows = revenueByMonth(
      [doc({}), doc({ doc_type: "credit_note", taxable: 2000 }), doc({ currency: "USD", fx_rate: 83, taxable: 100 }), doc({ status: "draft" })],
      "2026-10-27",
    );
    expect(rows.at(-1)).toMatchObject({ month: "2026-10", value: 10000 - 2000 + 8300 });
    expect(rows).toHaveLength(12);
  });
});

describe("kpis", () => {
  it("adds outstanding, overdue, collections, TDS and win rate", () => {
    const k = kpis(
      [doc({}), doc({ doc_type: "quote", status: "accepted" }), doc({ doc_type: "quote", status: "declined" }), doc({ doc_type: "quote", status: "issued", total: 5000 })],
      [{ paid_on: "2026-10-10", amount: 9000, tds_amount: 1000, mode: "bank", currency: "INR", fx_rate: 1 } as never],
      "26-27",
      "2026-10-27",
    );
    expect(k).toMatchObject({ outstanding: 11800, overdue: 11800, overdueCount: 1, revenueFy: 10000, collectedFy: 9000, tdsFy: 1000, quotesOpen: 5000, winRate: 0.5 });
  });
});
