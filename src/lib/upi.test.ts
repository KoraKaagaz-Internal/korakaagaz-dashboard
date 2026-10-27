import { describe, expect, it } from "vitest";
import { isValidVpa, upiUri } from "./upi";

describe("upiUri", () => {
  it("builds a payable link with amount and note", () => {
    expect(upiUri({ vpa: "9876543210@okbank", name: "Kora Kaagaz", amount: 15000, note: "KK/26-27/001" })).toBe(
      "upi://pay?pa=9876543210%40okbank&pn=Kora%20Kaagaz&cu=INR&am=15000.00&tn=KK%2F26-27%2F001",
    );
  });
  it("validates VPAs", () => {
    expect(isValidVpa("name@okhdfcbank")).toBe(true);
    expect(isValidVpa("not a vpa")).toBe(false);
  });
});
