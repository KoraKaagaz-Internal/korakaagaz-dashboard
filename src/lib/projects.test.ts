import { describe, expect, it } from "vitest";
import { projectFee, projectMoney, retainerMonths, splitAmount } from "./projects";

describe("project money", () => {
  it("retainer months run from the start month to the end or today", () => {
    expect(retainerMonths("2026-08-20", null, "2026-11-15")).toBe(4);
    expect(retainerMonths("2026-08-20", "2026-09-10", "2026-11-15")).toBe(2);
    expect(retainerMonths(null, null, "2026-11-15")).toBe(1);
    expect(retainerMonths("2026-12-01", null, "2026-11-15")).toBe(1); // not started yet
  });
  it("fee is the fixed fee or the retainer so far", () => {
    const p = { start_date: "2026-09-01", due_date: null };
    expect(projectFee({ budget: 36904, billing: "fixed", retainer_amount_month: 0 }, p, "2026-11-15")).toBe(36904);
    expect(projectFee({ budget: 0, billing: "retainer", retainer_amount_month: 20000 }, p, "2026-11-15")).toBe(60000);
    expect(projectFee(null, p, "2026-11-15")).toBe(0);
  });
  it("split by % of the fee or in ₹", () => {
    expect(splitAmount(30, "pct", 36904)).toBe(11071.2);
    expect(splitAmount(5000, "inr", 36904)).toBe(5000);
  });
  it("P&L: received, pending, split and your share", () => {
    const m = projectMoney(
      100000,
      [
        { amount: 40000, tds_amount: 0 },
        { amount: 18000, tds_amount: 2000 },
      ],
      [
        { split: true, cost: 30000, paid: 10000, balance: 20000 },
        { split: false, cost: 5000, paid: 5000, balance: 0 },
      ],
    );
    expect(m).toEqual({ fee: 100000, received: 60000, pending: 40000, split: 30000, splitPaid: 10000, splitDue: 20000, other: 5000, share: 65000 });
  });
  it("money above the fee counts in your share, never negative pending", () => {
    const m = projectMoney(10000, [{ amount: 12000, tds_amount: 0 }], []);
    expect(m).toMatchObject({ pending: 0, share: 12000 });
  });
});
