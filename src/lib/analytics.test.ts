import { describe, expect, it } from "vitest";
import {
  accrualRevenue,
  cashPosition,
  cashRevenue,
  cei,
  cohorts,
  comparison,
  concentration,
  delta,
  dsoSeries,
  expenseCosts,
  forecast13w,
  months,
  newVsRepeat,
  onTime,
  period,
  pnl,
  projectTable,
  quoteFunnel,
  receivablesAt,
  utilisation,
  waterfall,
  type ADoc,
  type AExp,
} from "./analytics";

const doc = (o: Partial<ADoc>): ADoc => ({
  id: "d", doc_type: "invoice", status: "issued", client_id: "c", client_name: "Acme", project_id: null, issue_date: "2026-10-05", due_date: "2026-10-20",
  currency: "INR", fx_rate: 1, taxable: 1000, total: 1180, source_id: null, source_relation: null, recurring: null, balance: 1180, ...o,
});
const exp = (o: Partial<AExp>): AExp => ({
  expense_date: "2026-10-10", category: "Props & sets", category_kind: "pass_through", project_id: null, taxable: 100, total: 118, itc_status: "eligible", rcm: false, fx_rate: 1,
  kind: "receipt", approval: null, is_draft: false, due_date: null, balance: 0, recurring: null, tds_amount: 0, tds_challan_id: null, ...o,
});

describe("periods", () => {
  it("knows Indian FY quarters and years", () => {
    expect(period("quarter", "2026-11-15")).toMatchObject({ from: "2026-10-01", to: "2026-12-31", label: "Q3 FY 26-27" });
    expect(period("quarter", "2027-02-01")).toMatchObject({ from: "2027-01-01", to: "2027-03-31", label: "Q4 FY 26-27" });
    expect(period("fy", "2026-11-15")).toMatchObject({ from: "2026-04-01", to: "2027-03-31" });
    expect(period("last_fy", "2026-11-15")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(period("last_month", "2026-03-15")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("compares with the previous same-length period or the same dates last year", () => {
    expect(comparison({ from: "2026-10-01", to: "2026-12-31" }, "previous")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(comparison({ from: "2026-03-01", to: "2026-03-31" }, "previous")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(comparison({ from: "2026-04-01", to: "2027-03-31" }, "year")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(comparison({ from: "2026-10-03", to: "2026-10-09" }, "previous")).toEqual({ from: "2026-09-26", to: "2026-10-02" });
  });
  it("percent change", () => {
    expect(delta(150, 100)).toBe(50);
    expect(delta(50, -100)).toBe(150);
    expect(delta(10, 0)).toBeNull();
    expect(delta(0, 0)).toBe(0);
  });
});

describe("revenue, costs and P&L", () => {
  const docs = [
    doc({ id: "a", taxable: 100000, total: 118000 }),
    doc({ id: "b", doc_type: "credit_note", taxable: 10000, total: 11800 }),
    doc({ id: "c", currency: "USD", fx_rate: 84, taxable: 1000, total: 1000, client_name: "Globex" }),
    doc({ id: "d", status: "draft", taxable: 999999 }),
  ];
  it("accrual revenue is pre-GST, credit notes negative, in INR", () => {
    expect(accrualRevenue(docs).map((r) => r.amount)).toEqual([100000, -10000, 84000]);
  });
  it("cash revenue strips the GST share and counts TDS the client kept", () => {
    expect(cashRevenue(docs, [{ document_id: "a", paid_on: "2026-10-25", amount: 108000, tds_amount: 10000 }])[0].amount).toBe(100000);
  });
  it("expense cost is pre-GST only when the credit comes back", () => {
    const c = expenseCosts([exp({}), exp({ itc_status: "blocked" }), exp({ kind: "claim", approval: "submitted" }), exp({ is_draft: true })]);
    expect(c.map((x) => x.amount)).toEqual([100, 118]);
  });
  it("builds the P&L and its waterfall", () => {
    const rev = accrualRevenue(docs);
    const costs = expenseCosts([exp({ taxable: 20000, total: 23600 }), exp({ category: "Rent", category_kind: "overhead", taxable: 30000, total: 35400 })]);
    const p = pnl(rev, costs, "2026-10-01", "2026-10-31");
    expect(p).toEqual({ revenue: 174000, passThrough: 20000, agi: 154000, overhead: 30000, net: 124000, grossMargin: 88.51, netMargin: 80.52, overheadRatio: 19.48 });
    expect(waterfall(p).map((s) => s.value)).toEqual([174000, -20000, 154000, -30000, 124000]);
  });
});

describe("clients", () => {
  const rev = [
    { date: "2026-04-10", client: "A", project_id: null, amount: 60 },
    { date: "2026-05-10", client: "B", project_id: null, amount: 30 },
    { date: "2026-07-10", client: "A", project_id: null, amount: 10 },
    { date: "2026-08-10", client: "C", project_id: null, amount: 10 },
  ];
  it("concentration with cumulative share", () => {
    expect(concentration(rev, "2026-04-01", "2026-08-31")).toEqual([
      { client: "A", value: 70, share: 63.64, cumulative: 63.64 },
      { client: "B", value: 30, share: 27.27, cumulative: 90.91 },
      { client: "C", value: 10, share: 9.09, cumulative: 100 },
    ]);
  });
  it("new vs repeat by month", () => {
    const r = newVsRepeat(rev, months("2026-04-01", "2026-07-31"));
    expect(r.map((m) => [m.key, m.New, m.Repeat])).toEqual([
      ["2026-04", 60, 0],
      ["2026-05", 30, 0],
      ["2026-06", 0, 0],
      ["2026-07", 0, 10],
    ]);
  });
  it("retention cohorts by first-billed FY quarter", () => {
    const c = cohorts(rev);
    expect(c).toEqual([
      { cohort: "Q2 26-27", clients: 1, later: [] },
      { cohort: "Q1 26-27", clients: 2, later: [50] },
    ]);
  });
});

describe("cash and collections", () => {
  const docs = [doc({ id: "a", issue_date: "2026-08-01", total: 1000, taxable: 1000, due_date: "2026-08-15", balance: 400 }), doc({ id: "b", issue_date: "2026-09-10", total: 2000, taxable: 2000, due_date: "2026-11-20", balance: 2000 })];
  const pays = [{ document_id: "a", paid_on: "2026-09-05", amount: 500, tds_amount: 100 }];
  it("receivables at a date", () => {
    expect(receivablesAt(docs, pays, "2026-08-31")).toBe(1000);
    expect(receivablesAt(docs, pays, "2026-09-30")).toBe(2400);
  });
  it("DSO = receivables ÷ last 90 days' billing × 90", () => {
    const s = dsoSeries(docs, pays, months("2026-09-01", "2026-09-30"));
    expect(s[0]).toMatchObject({ dso: 72, ar: 2400 });
  });
  it("collection effectiveness", () => {
    expect(cei(docs, pays, "2026-09-01", "2026-09-30", "2026-10-30")).toBe(60);
  });
  it("cash and runway", () => {
    const c = cashPosition(100000, "2026-08-01", [{ date: "2026-09-01", amount: 50000 }], [{ date: "2026-09-10", amount: 30000 }, { date: "2026-07-01", amount: 999 }], "2026-10-15");
    expect(c).toEqual({ cash: 120000, monthlyBurn: 10000, runwayMonths: 12 });
  });
  it("13-week forecast puts overdue invoices in week 1 and bills on their due dates", () => {
    const f = forecast13w({
      today: "2026-11-04",
      cash: 1000,
      docs,
      exps: [exp({ kind: "bill", balance: 300, due_date: "2026-11-12" }), exp({ recurring: { every: "month", next: "2026-11-05" }, total: 500, tds_amount: 0 })],
    });
    expect(f[0]).toMatchObject({ week: "2026-11-02", in: 400, out: 500, balance: 900 });
    expect(f[1]).toMatchObject({ in: 0, out: 300 });
    expect(f[2]).toMatchObject({ in: 2000 });
    expect(f.length).toBe(13);
  });
});

describe("projects and team", () => {
  it("project profit and hours against the budget", () => {
    const t = projectTable(
      [{ id: "p", code: "KK-1", name: "Shoot", status: "active", budget_hours: 10 }],
      [{ date: "2026-10-01", client: "A", project_id: "p", amount: 50000 }],
      [{ date: "2026-10-01", category: "Props", kind: "pass_through", project_id: "p", amount: 10000 }],
      new Map([["p", 1200]]),
    );
    expect(t[0]).toMatchObject({ revenue: 50000, expenses: 10000, hours: 20, profit: 40000, margin: 80, overBudget: true });
    expect(t[0]).not.toHaveProperty("ehr");
  });
  it("utilisation per week against capacity after leave", () => {
    const u = utilisation(
      [
        { member_email: "a", work_date: "2026-11-03", minutes: 1200 },
        { member_email: "a", work_date: "2026-11-04", minutes: 600 },
      ],
      [{ email: "a", capacity: 40 }],
      ["2026-11-02"],
      [{ member_email: "a", from_date: "2026-11-06", to_date: "2026-11-06", half_day: false, status: "approved" }],
      [],
    );
    expect(u[0].weeks[0]).toEqual({ week: "2026-11-02", logged: 30, capacity: 32, pct: 94 });
  });
  it("on-time and the quote funnel", () => {
    expect(onTime([{ due_date: "2026-10-10", completed_at: "2026-10-09T10:00:00Z" }, { due_date: "2026-10-10", completed_at: "2026-10-12T10:00:00Z" }, { due_date: null, completed_at: "2026-10-12T10:00:00Z" }], "2026-10-01", "2026-10-31")).toEqual({ done: 2, late: 1, pct: 50 });
    const f = quoteFunnel(
      [doc({ id: "q1", doc_type: "quote", status: "accepted" }), doc({ id: "q2", doc_type: "quote", status: "declined" }), doc({ id: "q3", doc_type: "quote", status: "issued" }), doc({ id: "i1", source_id: "q1", source_relation: "converted_from" })],
      "2026-10-01",
      "2026-10-31",
    );
    expect(f.stages.map((s) => s.count)).toEqual([3, 1, 1]);
    expect(f.winRate).toBe(50);
  });
});
