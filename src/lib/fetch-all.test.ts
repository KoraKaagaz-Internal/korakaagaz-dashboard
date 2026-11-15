import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";

const table = Array.from({ length: 2500 }, (_, i) => i);
const page = (a: number, b: number) => Promise.resolve({ data: table.slice(a, b + 1), error: null });

describe("fetchAll", () => {
  it("pages past Supabase's 1,000-row cap", async () => {
    expect(await fetchAll(page)).toHaveLength(2500);
  });
  it("stops at max without asking for an empty range", async () => {
    const asked: [number, number][] = [];
    const r = await fetchAll((a, b) => (asked.push([a, b]), page(a, b)), 1000);
    expect(r).toHaveLength(1000);
    expect(asked).toEqual([[0, 999]]);
    expect(await fetchAll(page, 500)).toHaveLength(500);
  });
  it("throws instead of returning a partial list", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
