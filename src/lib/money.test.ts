import { describe, expect, it } from "vitest";
import { addMonths, amountInWords, computeTotals, financialYear, formatAmount, formatInvoiceDate, isValidDocNumber, lineAmount, todayIso } from "./money";

const base = { discount_type: "none" as const, discount_value: 0, gst_mode: "none" as const, gst_rate: 0 };

describe("computeTotals", () => {
  it("matches the template sample", () => {
    const t = computeTotals({ ...base, items: [{ qty: 1, unit_price: 15000 }] });
    expect(t).toMatchObject({ subtotal: 15000, discount: 0, tax: 0, total: 15000 });
  });

  it("sums multiple lines without float drift", () => {
    const t = computeTotals({
      ...base,
      items: [
        { qty: 3, unit_price: 0.1 },
        { qty: 1, unit_price: 0.2 },
      ],
    });
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

describe("todayIso", () => {
  it("returns an ISO date in the given time zone", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIso("Asia/Kolkata")).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  });
});

describe("round off", () => {
  it("rounds the total and reports the adjustment", () => {
    const t = computeTotals({ ...base, items: [{ qty: 1, unit_price: 999.6 }], round_off: true });
    expect(t.total).toBe(1000);
    expect(t.roundOff).toBe(0.4);
  });
});

describe("financialYear", () => {
  it("rolls over on 1 April", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
    expect(financialYear("2027-01-15")).toBe("26-27");
    expect(financialYear("2099-12-01")).toBe("99-00");
  });
});

describe("isValidDocNumber", () => {
  it("enforces Rule 46(b)", () => {
    expect(isValidDocNumber("KK/26-27/001")).toBe(true);
    expect(isValidDocNumber("KK 26-27 001")).toBe(false);
    expect(isValidDocNumber("KKSTUDIO/2026-27/0001")).toBe(false);
  });
});

describe("amountInWords", () => {
  it("uses lakh and crore", () => {
    expect(amountInWords(15000)).toBe("Rupees Fifteen Thousand Only");
    expect(amountInWords(150000)).toBe("Rupees One Lakh Fifty Thousand Only");
    expect(amountInWords(12345678.5)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only");
    expect(amountInWords(23600)).toBe("Rupees Twenty Three Thousand Six Hundred Only");
  });
  it("handles foreign currency", () => {
    expect(amountInWords(1250.25, "USD")).toBe("US Dollars One Thousand Two Hundred Fifty and Twenty Five Cents Only");
  });
});

describe("addMonths", () => {
  it("clamps to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});
