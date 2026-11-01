import { describe, expect, it } from "vitest";
import { b2b, b2cl, b2cs, docSeries, exp, hsn, toCsv } from "./gstr1";
import type { DocumentRecord } from "./types";

const d = (o: Omit<Partial<DocumentRecord>, "client"> & { client?: Partial<DocumentRecord["client"]> }): DocumentRecord =>
  ({
    doc_type: "invoice",
    status: "issued",
    number: "KK/26-27/001",
    issue_date: "2026-10-05",
    currency: "INR",
    fx_rate: 1,
    place_of_supply: "21",
    export_type: "none",
    reverse_charge: false,
    gst_rate: 18,
    taxable: 10000,
    total: 11800,
    cgst: 900,
    sgst: 900,
    igst: 0,
    items: [{ title: "Design", description: "", sac: "998391", qty: 1, unit_price: 10000 }],
    ...o,
    client: { name: "Acme", gstin: "", state_code: "21", country: "India", email: "", phone: "", address: "", city: "", pin: "", ...o.client },
  }) as DocumentRecord;

describe("GSTR-1 sections", () => {
  const docs = [
    d({ client: { gstin: "21AAPFU0939F1ZE" } }),
    d({ number: "KK/26-27/002", place_of_supply: "29", taxable: 200000, total: 236000, cgst: 0, sgst: 0, igst: 36000 }), // B2CL
    d({ number: "KK/26-27/003" }), // B2CS intra-state
    d({ number: "KK/26-27/004", place_of_supply: "96", export_type: "lut", currency: "USD", fx_rate: 83, taxable: 1000, total: 1000, cgst: 0, sgst: 0 }),
    d({ number: "KK/26-27/005", status: "cancelled" }),
  ];
  it("splits invoices into the right tables", () => {
    expect(b2b(docs)).toHaveLength(1);
    expect(b2b(docs)[0]).toMatchObject({ "Invoice date": "05-Oct-2026", "Place Of Supply": "21-Odisha", "Taxable Value": 10000 });
    expect(b2cl(docs, "21").map((r) => r["Invoice Number"])).toEqual(["KK/26-27/002"]);
    expect(b2cs(docs, "21")).toEqual([expect.objectContaining({ "Place Of Supply": "21-Odisha", "Taxable Value": 10000 })]);
    expect(exp(docs)[0]).toMatchObject({ "Export Type": "WOPAY", "Invoice Value": 83000, Rate: 0 });
  });
  it("summarises SAC and document series", () => {
    expect(hsn(docs, "b2b")[0]).toMatchObject({ HSN: "998391", "Taxable Value": 10000, "Central Tax Amount": 900 });
    expect(docSeries(docs)[0]).toMatchObject({ "Sr. No. From": "KK/26-27/001", "Sr. No. To": "KK/26-27/005", "Total Number": 5, Cancelled: 1 });
  });
  it("escapes CSV", () => {
    expect(toCsv([{ a: 'x, "y"', b: 1 }])).toBe('a,b\n"x, ""y""",1\n');
  });
});
