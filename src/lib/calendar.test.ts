import { describe, expect, it } from "vitest";
import { eventDays, findConflicts, istDate, istLocalToIso, isoToIstLocal, monthGrid, toIcs } from "./calendar";

describe("IST conversions", () => {
  it("round-trips datetime-local values", () => {
    expect(istLocalToIso("2026-11-04T09:30")).toBe("2026-11-04T04:00:00.000Z");
    expect(isoToIstLocal("2026-11-04T04:00:00.000Z")).toBe("2026-11-04T09:30");
    expect(istDate("2026-11-04T20:00:00.000Z")).toBe("2026-11-05");
  });
  it("lists the days an event covers", () => {
    expect(eventDays({ starts_at: istLocalToIso("2026-11-04T09:00"), ends_at: istLocalToIso("2026-11-06T00:00") })).toEqual(["2026-11-04", "2026-11-05"]);
    expect(eventDays({ starts_at: istLocalToIso("2026-11-04T09:00"), ends_at: istLocalToIso("2026-11-04T09:00") })).toEqual(["2026-11-04"]);
  });
});

describe("findConflicts", () => {
  const ev = (id: string, from: string, to: string, people: string[], kit: string[] = [], extra = {}) => ({
    id,
    title: id,
    starts_at: istLocalToIso(from),
    ends_at: istLocalToIso(to),
    status: "confirmed" as const,
    type: "shoot" as const,
    people,
    kit,
    ...extra,
  });
  it("flags shared people or kit in overlapping time", () => {
    const draft = ev("new", "2026-11-04T09:00", "2026-11-04T17:00", ["a", "b"], ["cam1"]);
    const others = [
      ev("x", "2026-11-04T16:00", "2026-11-04T20:00", ["b"]),
      ev("y", "2026-11-04T10:00", "2026-11-04T12:00", ["c"], ["cam1"]),
      ev("z", "2026-11-04T17:00", "2026-11-04T19:00", ["a"]), // touches, doesn't overlap
      ev("w", "2026-11-04T10:00", "2026-11-04T12:00", ["a"], [], { status: "cancelled" }),
      ev("v", "2026-11-04T10:00", "2026-11-04T12:00", ["d"]),
    ];
    const c = findConflicts(draft, others);
    expect(c.map((x) => [x.with.id, x.people, x.kit])).toEqual([
      ["x", ["b"], []],
      ["y", [], ["cam1"]],
    ]);
  });
  it("ignores itself and deadlines", () => {
    const d = ev("a", "2026-11-04T09:00", "2026-11-04T17:00", ["a"]);
    expect(findConflicts(d, [d])).toEqual([]);
    expect(findConflicts({ ...d, id: "b", type: "deadline" }, [d])).toEqual([]);
  });
});

describe("monthGrid", () => {
  it("starts on the Monday before the 1st", () => {
    const g = monthGrid("2026-11-15");
    expect(g[0][0]).toBe("2026-10-26");
    expect(g.flat()).toContain("2026-11-30");
    expect(g.length).toBe(6);
  });
});

describe("toIcs", () => {
  it("writes a valid feed with escaping, all-day ends and folding", () => {
    const ics = toIcs(
      "Kora Kaagaz",
      [
        {
          uid: "e1",
          title: "Shoot; Acme, day 1",
          start: "2026-11-04T03:30:00.000Z",
          end: "2026-11-04T11:30:00.000Z",
          allDay: false,
          location: "Studio 2",
          tentative: true,
          description: "Call 9:00\nBring: 85mm",
        },
        { uid: "t1", title: "Due: Retouching", start: "2026-11-06", end: "2026-11-06", allDay: true, description: "x".repeat(120) },
      ],
      "2026-10-30T00:00:00.000Z",
    );
    expect(ics).toContain("SUMMARY:Shoot\\; Acme\\, day 1\r\n");
    expect(ics).toContain("DTSTART:20261104T033000Z\r\nDTEND:20261104T113000Z");
    expect(ics).toContain("DESCRIPTION:Call 9:00\\nBring: 85mm");
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
