import { describe, expect, it } from "vitest";
import { computeTotals, formatAmount, formatInvoiceDate, lineAmount } from "./money";

const base = { discount_type: "none" as const, discount_value: 0, gst_mode: "none" as const, gst_rate: 0 };

describe("computeTotals", () => {
  it("matches the template sample", () => {
    const t = computeTotals({ ...base, items: [{ qty: 1, unit_price: 15000 }] });
    expect(t).toMatchObject({ subtotal: 15000, discount: 0, tax: 0, total: 15000 });
  });

  it("sums multiple lines without float drift", () => {
    const t = computeTotals({ ...base, items: [{ qty: 3, unit_price: 0.1 }, { qty: 1, unit_price: 0.2 }] });
    expect(t.subtotal).toBe(0.5);
  });

  it("applies a percent discount before GST", () => {
    const t = computeTotals({
      items: [{ qty: 2, unit_price: 10000 }],
      discount_type: "percent",
      discount_value: 10,
      gst_mode: "igst",
      gst_rate: 18,
    });
    expect(t).toMatchObject({ subtotal: 20000, discount: 2000, taxable: 18000, igst: 3240, tax: 3240, total: 21240 });
  });

  it("splits CGST/SGST evenly", () => {
    const t = computeTotals({ ...base, items: [{ qty: 1, unit_price: 15000 }], gst_mode: "cgst_sgst", gst_rate: 18 });
    expect(t).toMatchObject({ cgst: 1350, sgst: 1350, tax: 2700, total: 17700 });
  });

  it("never discounts below zero", () => {
    const t = computeTotals({ ...base, items: [{ qty: 1, unit_price: 500 }], discount_type: "flat", discount_value: 900 });
    expect(t.discount).toBe(500);
    expect(t.total).toBe(0);
  });

  it("treats blank inputs as zero", () => {
    expect(lineAmount({ qty: NaN, unit_price: 100 })).toBe(0);
  });
});

describe("formatAmount", () => {
  it("uses Indian grouping", () => {
    expect(formatAmount(15000)).toBe("15,000");
    expect(formatAmount(150000)).toBe("1,50,000");
    expect(formatAmount(12345678.5)).toBe("1,23,45,678.50");
  });
});

describe("formatInvoiceDate", () => {
  it("formats like the template", () => {
    expect(formatInvoiceDate("2026-09-26")).toBe("26th Sep, 2026");
    expect(formatInvoiceDate("2026-01-01")).toBe("1st Jan, 2026");
    expect(formatInvoiceDate("2026-01-12")).toBe("12th Jan, 2026");
    expect(formatInvoiceDate("2026-03-23")).toBe("23rd Mar, 2026");
  });
});
