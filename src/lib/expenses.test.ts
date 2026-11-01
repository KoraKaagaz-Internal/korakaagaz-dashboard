import { describe, expect, it } from "vitest";
import { itcSummary, match2b, nextRecurring, purchaseGst, readPortal2b, rebillLines, suggestTds } from "./expenses";

describe("purchaseGst", () => {
  it("splits CGST/SGST in-state and IGST across states", () => {
    expect(purchaseGst({ taxable: 1000, rate: 18, supplierState: "21", ourState: "21", rcm: false })).toEqual({ cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 });
    expect(purchaseGst({ taxable: 1000, rate: 18, supplierState: "29", ourState: "21", rcm: false })).toEqual({ cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 });
  });
  it("treats an unknown supplier state as in-state", () => {
    expect(purchaseGst({ taxable: 100, rate: 5, supplierState: "", ourState: "21", rcm: false }).cgst).toBe(2.5);
  });
  it("under reverse charge the supplier is owed only the taxable value", () => {
    expect(purchaseGst({ taxable: 10000, rate: 18, supplierState: "21", ourState: "21", rcm: true })).toMatchObject({ tax: 1800, total: 10000 });
  });
});

describe("suggestTds", () => {
  it("professional fees: none until the payee crosses ₹50k in the year", () => {
    expect(suggestTds({ nature: "professional", taxable: 30000, isCompany: false, hasPan: true, paidThisYear: 0 })).toMatchObject({ apply: false, amount: 0 });
    expect(suggestTds({ nature: "professional", taxable: 30000, isCompany: false, hasPan: true, paidThisYear: 25000 })).toMatchObject({ apply: true, rate: 10, amount: 3000 });
  });
  it("contractor: single bill over ₹30k, 1% individual, 2% company", () => {
    expect(suggestTds({ nature: "contractor", taxable: 40000, isCompany: false, hasPan: true, paidThisYear: 0 })).toMatchObject({ apply: true, rate: 1, amount: 400 });
    expect(suggestTds({ nature: "contractor", taxable: 40000, isCompany: true, hasPan: true, paidThisYear: 0 }).rate).toBe(2);
    expect(suggestTds({ nature: "contractor", taxable: 20000, isCompany: false, hasPan: true, paidThisYear: 70000 }).apply).toBe(false);
    expect(suggestTds({ nature: "contractor", taxable: 20000, isCompany: false, hasPan: true, paidThisYear: 90000 }).apply).toBe(true);
  });
  it("rent is tested per month; no PAN means 20%", () => {
    expect(suggestTds({ nature: "rent_building", taxable: 45000, isCompany: false, hasPan: true, paidThisYear: 500000, paidThisMonth: 0 }).apply).toBe(false);
    expect(suggestTds({ nature: "rent_building", taxable: 60000, isCompany: false, hasPan: false, paidThisYear: 0, paidThisMonth: 0 })).toMatchObject({
      apply: true,
      rate: 20,
      amount: 12000,
    });
  });
  it("no TDS nature means no TDS", () => {
    expect(suggestTds({ nature: "none", taxable: 9e6, isCompany: false, hasPan: true, paidThisYear: 0 }).apply).toBe(false);
  });
});

describe("itcSummary (GSTR-3B Table 4)", () => {
  const e = (o: Partial<Parameters<typeof itcSummary>[0][number]>) =>
    ({
      id: "x",
      kind: "bill",
      expense_date: "2026-10-05",
      taxable: 1000,
      cgst: 90,
      sgst: 90,
      igst: 0,
      total: 1180,
      rcm: false,
      itc_status: "eligible",
      gstr2b: "matched",
      itc_month: null,
      fx_rate: 1,
      currency: "INR",
      ...o,
    }) as never;
  it("buckets eligible, blocked and held-back credit for the month", () => {
    const s = itcSummary(
      [
        e({}),
        e({ itc_status: "blocked", cgst: 25, sgst: 25 }),
        e({ gstr2b: "missing", igst: 36, cgst: 0, sgst: 0 }),
        e({ unpaid_days: 200 } as never),
        e({ itc_status: "ineligible" }),
        e({ expense_date: "2026-09-30" }),
        e({ expense_date: "2026-09-30", itc_month: "2026-10-01", rcm: true }),
      ],
      "2026-10",
    );
    expect(s).toEqual({ a: 626, b1: 50, b2: 216, c: 360, rcmPayable: 180, count: 5 });
  });
});

describe("rebillLines", () => {
  it("marks up the pre-tax cost, or the full cost when GST can't be claimed", () => {
    const lines = rebillLines(
      [
        { category: "Props & sets", description: "Florals", vendor: "Bloom Co", taxable: 1000, total: 1180, rcm: false, itc_status: "eligible", markup_pct: 10, fx_rate: 1 },
        { category: "Travel & cabs", description: "", vendor: "", taxable: 500, total: 525, rcm: false, itc_status: "blocked", markup_pct: 0, fx_rate: 1 },
      ],
      "998391",
    );
    expect(lines).toEqual([
      { title: "Props & sets: Florals", description: "Incurred via Bloom Co", sac: "998391", qty: 1, unit_price: 1100 },
      { title: "Travel & cabs", description: "", sac: "998391", qty: 1, unit_price: 525 },
    ]);
  });
});

describe("recurring and 2B", () => {
  it("steps monthly, quarterly, yearly", () => {
    expect(nextRecurring("2026-01-31", "month")).toBe("2026-02-28");
    expect(nextRecurring("2026-11-05", "quarter")).toBe("2027-02-05");
    expect(nextRecurring("2026-11-05", "year")).toBe("2027-11-05");
  });
  it("reads a portal 2B CSV and matches on GSTIN + bill number + tax", () => {
    const csv = [
      "Goods and Services Tax - GSTR 2B,,,,,,",
      "GSTIN of supplier,Trade/Legal name,Invoice number,Invoice Date,Taxable Value (₹),Integrated Tax(₹),Central Tax(₹),State/UT Tax(₹)",
      '21AAAAA0000A1Z5,Bloom Co,INV-001,01/10/2026,"1,000.00",0,90,90',
      "29BBBBB1111B1Z6,Lens Rentals,LR/77,02/10/2026,5000,900,0,0",
      "27CCCCC2222C1Z7,Unknown,X9,03/10/2026,100,18,0,0",
    ].join("\n");
    const portal = readPortal2b(csv);
    expect(portal).toEqual([
      { gstin: "21AAAAA0000A1Z5", invoice_no: "INV-001", taxable: 1000, tax: 180 },
      { gstin: "29BBBBB1111B1Z6", invoice_no: "LR/77", taxable: 5000, tax: 900 },
      { gstin: "27CCCCC2222C1Z7", invoice_no: "X9", taxable: 100, tax: 18 },
    ]);
    const m = match2b(
      [
        { id: "a", gstin: "21aaaaa0000a1z5", bill_no: "inv 001", tax: 180 },
        { id: "b", gstin: "29BBBBB1111B1Z6", bill_no: "LR-77", tax: 450 },
        { id: "c", gstin: "07DDDDD3333D1Z8", bill_no: "1", tax: 50 },
      ],
      portal,
    );
    expect(m.results.map((r) => [r.id, r.status])).toEqual([
      ["a", "matched"],
      ["b", "mismatch"],
      ["c", "missing"],
    ]);
    expect(m.notInBooks.map((p) => p.invoice_no)).toEqual(["X9"]);
  });
});
