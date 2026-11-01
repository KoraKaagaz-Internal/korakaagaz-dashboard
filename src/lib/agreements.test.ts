import { describe, expect, it } from "vitest";
import { applyChoices, cleanItems, fillMerge, priceTotals, renderMarkdown, unfilled } from "./agreements";

describe("merge fields", () => {
  it("fills known fields and marks missing ones", () => {
    const out = fillMerge("Hello {{client.name}}, from {{ studio.name }}. Fee {{fee}}.", { "client.name": "Acme", "studio.name": "Kora Kaagaz", fee: "" });
    expect(out).toBe("Hello Acme, from Kora Kaagaz. Fee [fee].");
    expect(unfilled(out)).toEqual(["fee"]);
  });
});

describe("markdown", () => {
  it("renders headings, lists, emphasis and paragraphs", () => {
    const html = renderMarkdown("# Title\n\nSome **bold** and *italic*.\nNext line\n\n- a\n- b\n\n1. one\n2. two");
    expect(html).toBe(
      "<h1>Title</h1>\n<p>Some <strong>bold</strong> and <em>italic</em>.<br>Next line</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<ol>\n<li>one</li>\n<li>two</li>\n</ol>",
    );
  });
  it("escapes HTML so a body can't inject markup", () => {
    expect(renderMarkdown('<script>alert(1)</script> <img src=x onerror="y">')).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=&quot;y&quot;&gt;</p>");
  });
  it("highlights unfilled fields", () => {
    expect(renderMarkdown("Fee [fee]")).toContain('<mark class="ag-missing">[fee]</mark>');
  });
});

describe("pricing", () => {
  const items = cleanItems([
    { title: "Identity", amount: 100000, optional: false, selected: false },
    { title: "Stationery", amount: 20000, optional: true, selected: false },
    { title: "Social kit", amount: 30000, optional: true, selected: true },
    { title: "  ", amount: 5 },
  ]);
  it("cleans items and keeps required lines selected", () => {
    expect(items.map((i) => i.selected)).toEqual([true, false, true]);
  });
  it("totals only the chosen lines, with GST", () => {
    expect(priceTotals(items, 18)).toMatchObject({ subtotal: 130000, gst: 23400, total: 153400 });
  });
  it("applies the client's choices but never drops required lines", () => {
    const chosen = applyChoices(items, [1]);
    expect(chosen.map((i) => i.selected)).toEqual([true, true, false]);
    expect(priceTotals(chosen, 0).subtotal).toBe(120000);
  });
});
