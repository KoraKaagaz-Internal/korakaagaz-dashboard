import { describe, expect, it } from "vitest";
import { estimateRowHeight, paginate, wrapLines } from "./paginate";

const sample = {
  title: "UI/UX Design Engagement - SuperDMC",
  description:
    "Redesign of 56 screens (21 website + 35 dashboard) on one design system, with reusable booking patterns, B2B pricing, new workflows, mobile layouts and two feedback rounds.",
};

describe("wrapLines", () => {
  it("matches the template's line breaks", () => {
    expect(wrapLines(sample.title, 26)).toBe(2);
    expect(wrapLines(sample.description, 31)).toBe(6);
  });
  it("counts blank text as zero lines", () => {
    expect(wrapLines("   ", 30)).toBe(0);
  });
});

describe("paginate", () => {
  it("keeps the sample invoice on one page", () => {
    const pages = paginate([sample]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ isFirst: true, isLast: true });
  });

  it("spills a 15-item invoice onto later pages, totals on the last", () => {
    const items = Array.from({ length: 15 }, () => sample);
    const pages = paginate(items);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.items.map((r) => r.index))).toEqual(items.map((_, i) => i));
    expect(pages.at(-1)!.isLast).toBe(true);
  });

  it("estimates the sample row at about the template's height", () => {
    expect(estimateRowHeight(sample)).toBeGreaterThan(140);
    expect(estimateRowHeight(sample)).toBeLessThan(207);
  });
});

describe("paginate with discount + GST rows", () => {
  it("keeps the sample on one page with discount, CGST and SGST", () => {
    expect(paginate([sample], 3)).toHaveLength(1);
  });
});

describe("paginate totals page", () => {
  it("never leaves the totals page without items", () => {
    for (let n = 2; n <= 30; n++) {
      const pages = paginate(Array.from({ length: n }, () => sample));
      expect(pages.at(-1)!.items.length).toBeGreaterThan(0);
      expect(pages.flatMap((p) => p.items.map((r) => r.index))).toEqual([...Array(n).keys()]);
    }
  });
});
