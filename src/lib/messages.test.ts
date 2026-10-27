import { describe, expect, it } from "vitest";
import { DEFAULT_MESSAGES, fillTemplate } from "./messages";

describe("fillTemplate", () => {
  it("fills known placeholders and keeps unknown ones", () => {
    expect(fillTemplate("Hi {client}, {doc_no} {nope}", { client: "SuperDMC", doc_no: "KK/26-27/001" })).toBe(
      "Hi SuperDMC, KK/26-27/001 {nope}",
    );
  });
  it("renders the default WhatsApp message", () => {
    const out = fillTemplate(DEFAULT_MESSAGES.whatsapp, {
      client: "SuperDMC", doc_title_lower: "invoice", doc_no: "KK/26-27/001", amount: "₹15,000",
      business: "Kora Kaagaz", due_line: " Due by 3rd Nov, 2026.", link: "https://x/d/abc",
    });
    expect(out).toContain("invoice KK/26-27/001 for ₹15,000 from Kora Kaagaz. Due by 3rd Nov, 2026. View & pay: https://x/d/abc");
  });
});
