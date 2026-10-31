import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING, freeSlots, leadFunnel, pipeline, slugify } from "./crm";

describe("pipeline", () => {
  it("counts by stage and weights open deals by their chance", () => {
    const p = pipeline([
      { stage: "enquiry", value: 100000 },
      { stage: "proposal", value: 200000 },
      { stage: "won", value: 50000 },
      { stage: "lost", value: 999 },
    ]);
    expect(p.open).toBe(2);
    expect(p.openValue).toBe(300000);
    expect(p.weighted).toBe(110000);
    expect(p.by.find((s) => s.stage === "won")).toMatchObject({ count: 1, value: 50000 });
  });
});

describe("leadFunnel", () => {
  const l = (stage: string, furthest: string, source = "website", created = "2026-10-05", won_at: string | null = null, value = 0) =>
    ({ stage, furthest_stage: furthest, source, created_at: `${created}T10:00:00Z`, won_at, value }) as never;
  it("counts how far leads got, win rate and sources", () => {
    const f = leadFunnel(
      [
        l("won", "won", "referral", "2026-10-01", "2026-10-21T00:00:00Z", 80000),
        l("lost", "proposal", "website"),
        l("lost", "enquiry", "instagram"),
        l("discovery", "discovery", "website"),
        l("enquiry", "enquiry", "website", "2026-08-01"),
      ],
      "2026-10-01",
      "2026-10-31",
    );
    expect(f.stages.map((s) => s.count)).toEqual([4, 3, 2, 1]);
    expect(f.winRate).toBe(33);
    expect(f.avgDaysToWin).toBe(20);
    expect(f.sources.find((s) => s.source === "Referral")).toMatchObject({ leads: 1, won: 1, winRate: 100, value: 80000 });
    expect(f.sources.find((s) => s.source === "Website")).toMatchObject({ leads: 2, won: 0, winRate: 0 });
  });
});

describe("freeSlots", () => {
  const now = new Date("2026-11-02T03:30:00Z"); // Mon 09:00 IST
  it("offers weekday slots after the notice period, skipping busy times with a buffer", () => {
    const b = { ...DEFAULT_BOOKING, notice_hours: 4, horizon_days: 1, start: "11:00", end: "13:00", minutes: 30, buffer: 15, days: [1, 2] };
    const busy = [{ starts_at: "2026-11-02T06:30:00Z", ends_at: "2026-11-02T07:00:00Z" }]; // 12:00–12:30 IST
    const s = freeSlots(b, busy, now);
    // Monday: notice → from 13:00 IST? no: 09:00 + 4h = 13:00, nothing left; Tuesday all four
    expect(s.map((d) => d.date)).toEqual(["2026-11-03"]);
    expect(s[0].slots.length).toBe(4);
    const mon = freeSlots({ ...b, notice_hours: 1 }, busy, now);
    // Monday 11:00 ok, 11:30 hits the 11:45 buffer, 12:00 busy, 12:30 within buffer → only 11:00
    expect(mon[0]).toEqual({ date: "2026-11-02", slots: ["2026-11-02T05:30:00.000Z"] });
  });
  it("skips non-working days and holidays", () => {
    const b = { ...DEFAULT_BOOKING, notice_hours: 0, horizon_days: 6, days: [3] };
    expect(freeSlots(b, [], now, ["2026-11-04"])).toEqual([]);
  });
  it("slugs", () => expect(slugify("Kora Kaagaz — Discovery!")).toBe("kora-kaagaz-discovery"));
});
