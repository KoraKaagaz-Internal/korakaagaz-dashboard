import { describe, expect, it } from "vitest";
import { availableDays, hhmm, monthRange, parseDuration, retainerBurn, timerMinutes, weekCapacity, weekLoad, weekStart } from "./time";

describe("durations", () => {
  it("formats minutes", () => {
    expect(hhmm(90)).toBe("1:30");
    expect(hhmm(5)).toBe("0:05");
  });
  it("reads what people type", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1,25")).toBe(75);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("2h 15m")).toBe(135);
    expect(parseDuration("")).toBe(0);
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:75")).toBeNull();
  });
});

describe("timer", () => {
  it("rounds up to the minute and never returns 0", () => {
    const start = "2026-11-02T04:00:00.000Z";
    expect(timerMinutes(start, new Date("2026-11-02T04:00:10.000Z"))).toBe(1);
    expect(timerMinutes(start, new Date("2026-11-02T05:30:01.000Z"))).toBe(91);
  });
  it("caps a forgotten timer at 24 h", () => {
    expect(timerMinutes("2026-11-01T00:00:00.000Z", new Date("2026-11-04T00:00:00.000Z"))).toBe(1440);
  });
});

describe("weeks", () => {
  it("finds Monday", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // Wed
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sun
    expect(weekStart("2026-11-02")).toBe("2026-11-02"); // Mon
  });
  it("counts working days minus holidays and approved leave", () => {
    const leave = [
      { member_email: "a@x.co", from_date: "2026-11-03", to_date: "2026-11-04", half_day: false, status: "approved" as const },
      { member_email: "a@x.co", from_date: "2026-11-05", to_date: "2026-11-05", half_day: true, status: "approved" as const },
      { member_email: "a@x.co", from_date: "2026-11-06", to_date: "2026-11-06", half_day: false, status: "pending" as const },
    ];
    expect(availableDays("2026-11-02", "a@x.co", leave, [])).toBe(2.5);
    expect(availableDays("2026-11-02", "b@x.co", leave, ["2026-11-02"])).toBe(4);
    expect(weekCapacity(40, 2.5)).toBe(20);
  });
});

describe("weekLoad", () => {
  const monday = "2026-11-02";
  it("adds task estimates split between assignees, and event hours", () => {
    const tasks = [
      { due_date: "2026-11-04", estimate_hours: 8, status: "todo", assignees: ["a", "b"] },
      { due_date: "2026-11-06", estimate_hours: 3, status: "doing", assignees: ["a"] },
      { due_date: "2026-11-06", estimate_hours: 5, status: "done", assignees: ["a"] },
      { due_date: "2026-11-10", estimate_hours: 5, status: "todo", assignees: ["a"] },
    ];
    const events = [
      { starts_at: "2026-11-05T03:30:00Z", ends_at: "2026-11-05T11:30:00Z", status: "confirmed", type: "shoot", people: ["a"] },
      { starts_at: "2026-11-05T03:30:00Z", ends_at: "2026-11-05T11:30:00Z", status: "cancelled", type: "shoot", people: ["a"] },
      { starts_at: "2026-11-06T00:00:00Z", ends_at: "2026-11-06T00:00:00Z", status: "confirmed", type: "deadline", people: ["a"] },
    ];
    expect(weekLoad(monday, "a", tasks, events)).toEqual({ tasks: 7, events: 8, total: 15 });
  });
  it("caps multi-day events at 10 h a day", () => {
    const events = [{ starts_at: "2026-11-03T00:00:00+05:30", ends_at: "2026-11-05T00:00:00+05:30", status: "tentative", type: "shoot", people: ["a"] }];
    expect(weekLoad(monday, "a", [], events).events).toBe(20);
  });
});

describe("retainer and months", () => {
  it("reports burn, overage and what's left", () => {
    expect(retainerBurn(30 * 60, 40)).toEqual({ usedHours: 30, includedHours: 40, pct: 75, overHours: 0, leftHours: 10 });
    expect(retainerBurn(45 * 60, 40)).toMatchObject({ pct: 113, overHours: 5, leftHours: 0 });
  });
  it("finds the month's range", () => {
    expect(monthRange("2027-02-14")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(monthRange("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
