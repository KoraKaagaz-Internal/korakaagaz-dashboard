import { describe, expect, it } from "vitest";
import { modeLabel, payTargets, summarise, type PaymentLine } from "./payments";

const line = (o: Partial<PaymentLine>): PaymentLine => ({ id: "x", paid_on: "2026-11-15", amount: 0, tds: 0, mode: "upi", reference: "", note: "", client: "", project: null, invoice: null, file_name: "", ...o });

describe("payments", () => {
  it("sums today, month, FY and by method; skips advance adjustments and last FY", () => {
    const s = summarise(
      [
        line({ amount: 1000 }),
        line({ amount: 500, mode: "cash", paid_on: "2026-11-02" }),
        line({ amount: 2000, mode: "bank", paid_on: "2026-04-01", tds: 200 }),
        line({ amount: 9999, mode: "advance" }),
        line({ amount: 7777, paid_on: "2026-03-31" }), // previous FY
      ],
      "2026-11-15",
    );
    expect(s).toEqual({
      today: 1000,
      month: 1500,
      fy: 3500,
      tds: 200,
      byMode: [
        { mode: "bank", amount: 2000 },
        { mode: "upi", amount: 1000 },
        { mode: "cash", amount: 500 },
      ],
    });
  });
  it("lists what's owed, most first, never counting a project's invoice twice", () => {
    const t = payTargets(
      [
        { id: "p1", code: "KK-1", name: "Rebrand", client: "Acme", fee: 50000, received: 20000 },
        { id: "p2", code: "KK-2", name: "Shoot", client: "Beta", fee: 10000, received: 12000 },
      ],
      [
        { id: "i1", number: "INV/1", client: "Acme", project_id: "p1", balance: 11800 },
        { id: "i2", number: "INV/2", client: "Solo", project_id: null, balance: 5900 },
        { id: "i3", number: "INV/3", client: "Solo", project_id: null, balance: 0 },
      ],
    );
    expect(t.map((x) => [x.key, x.pending])).toEqual([
      ["project:p1", 30000],
      ["invoice:i2", 5900],
      ["project:p2", 0],
    ]);
    expect(t[0].invoices).toEqual([{ id: "i1", number: "INV/1", balance: 11800 }]);
  });
  it("labels methods", () => {
    expect(modeLabel("bank")).toBe("Bank transfer");
    expect(modeLabel("advance")).toBe("Advance adjusted");
  });
});
