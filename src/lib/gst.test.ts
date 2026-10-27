import { describe, expect, it } from "vitest";
import { autoGstMode, checkGstin, stateFromPin, stateLabel } from "./gst";

describe("checkGstin", () => {
  it("accepts real GSTINs and extracts state + PAN", () => {
    expect(checkGstin("27AAPFU0939F1ZV")).toEqual({ ok: true, state: "27", pan: "AAPFU0939F" });
    expect(checkGstin(" 29aagcb7383j1z4 ")).toMatchObject({ ok: true, state: "29" });
  });
  it("rejects typos via the check digit", () => {
    expect(checkGstin("27AAPFU0939F1ZW")).toMatchObject({ ok: false });
  });
  it("rejects bad format and unknown states", () => {
    expect(checkGstin("27AAPFU0939F1Z")).toMatchObject({ ok: false });
    expect(checkGstin("99AAPFU0939F1ZV")).toMatchObject({ ok: false });
  });
});

describe("autoGstMode", () => {
  it("picks CGST+SGST within the state, IGST across states", () => {
    expect(autoGstMode("21", "21", "none")).toBe("cgst_sgst");
    expect(autoGstMode("21", "29", "none")).toBe("igst");
  });
  it("handles exports", () => {
    expect(autoGstMode("21", "96", "lut")).toBe("none");
    expect(autoGstMode("21", "96", "igst")).toBe("igst");
  });
});

describe("stateFromPin", () => {
  it("maps common PINs", () => {
    expect(stateFromPin("769002")).toBe("21"); // Rourkela, Odisha
    expect(stateFromPin("560001")).toBe("29"); // Bengaluru
    expect(stateFromPin("400001")).toBe("27"); // Mumbai
    expect(stateFromPin("403001")).toBe("30"); // Goa
    expect(stateFromPin("110001")).toBe("07"); // Delhi
    expect(stateFromPin("682555")).toBe("31"); // Lakshadweep
    expect(stateFromPin("12345")).toBe("");
  });
  it("labels states", () => {
    expect(stateLabel("21")).toBe("Odisha (21)");
  });
});
