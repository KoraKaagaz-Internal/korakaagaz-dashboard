import { describe, expect, it } from "vitest";
import { dueDates } from "./compliance";

describe("dueDates", () => {
  it("monthly GST filer with TDS in November", () => {
    const d = dueDates("2026-11-01", "2026-11-30", { gstFiling: "monthly", stateCode: "21", tds: true });
    expect(d.map((x) => `${x.date} ${x.title}`)).toEqual([
      "2026-11-07 TDS deposit",
      "2026-11-11 GSTR-1",
      "2026-11-20 GSTR-3B + GST payment",
      "2026-11-30 Last date to claim GST input credit",
    ]);
  });
  it("March TDS is due on 30 April (no 7 April date); the Jan–Mar 26Q on 31 May", () => {
    const d = dueDates("2027-04-01", "2027-05-31", { gstFiling: "none", stateCode: "21", tds: true });
    expect(d.filter((x) => x.kind === "tds").map((x) => x.date)).toEqual(["2027-04-30", "2027-05-07", "2027-05-31"]);
  });
  it("QRMP: quarterly returns, monthly payments, 3B on the 24th in Odisha and 22nd in Karnataka", () => {
    const odisha = dueDates("2027-01-01", "2027-01-31", { gstFiling: "qrmp", stateCode: "21", tds: false }).filter((x) => x.kind === "gst");
    expect(odisha.map((x) => `${x.date} ${x.title}`)).toEqual(["2027-01-13 GSTR-1 (quarterly)", "2027-01-24 GSTR-3B (quarterly)"]);
    const ka = dueDates("2027-01-01", "2027-01-31", { gstFiling: "qrmp", stateCode: "29", tds: false }).filter((x) => x.title.startsWith("GSTR-3B"));
    expect(ka[0].date).toBe("2027-01-22");
    const feb = dueDates("2027-02-01", "2027-02-28", { gstFiling: "qrmp", stateCode: "21", tds: false }).filter((x) => x.kind === "gst");
    expect(feb.map((x) => `${x.date} ${x.title}`)).toEqual(["2027-02-25 GST payment (PMT-06)"]);
  });
  it("includes advance tax dates", () => {
    expect(dueDates("2026-12-01", "2026-12-31", { gstFiling: "none", stateCode: "21", tds: false }).map((x) => x.title)).toEqual(["Advance tax"]);
  });
});
