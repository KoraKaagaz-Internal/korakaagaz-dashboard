import { describe, expect, it } from "vitest";
import { clientAddressLines, fitClientName } from "./invoice-layout";

describe("fitClientName", () => {
  it("keeps short names large, shrinks medium ones, wraps very long ones", () => {
    expect(fitClientName("Acme")).toEqual({ size: 37, wrap: false });
    expect(fitClientName("MayKraft Studios")).toEqual({ size: 29, wrap: false });
    expect(fitClientName("MayKraft Studios Private Limited")).toEqual({ size: 18, wrap: true });
  });
});

describe("clientAddressLines", () => {
  const c = { address: "Third Floor, Flat no. T-9, R-8/30, Raj Nagar, Vandana Apartment, Ghaziabad, Uttar Pradesh, 201002", city: "Ghaziabad", pin: "201002", state_code: "09", country: "India", gstin: "09HQRPR4194C1Z4" };
  it("doesn't repeat city, PIN and state already in the address", () => {
    expect(clientAddressLines(c)).toEqual([c.address, "State code 09", "GSTIN: 09HQRPR4194C1Z4"]);
  });
  it("adds them when the address doesn't have them", () => {
    expect(clientAddressLines({ ...c, address: "Flat T-9, Raj Nagar" })).toEqual(["Flat T-9, Raj Nagar", "Ghaziabad 201002 · Uttar Pradesh (09)", "GSTIN: 09HQRPR4194C1Z4"]);
  });
});
