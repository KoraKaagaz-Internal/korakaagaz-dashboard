import { describe, expect, it } from "vitest";
import { dueBucket, initials, mentionedEmails, progress, projectHealth, sortBetween, timelineRange } from "./pm";

const t = (status: string, due: string | null = null, extra: Record<string, unknown> = {}) => ({ status, due_date: due, parent_id: null, estimate_hours: 1, ...extra }) as never;

describe("sortBetween", () => {
  it("puts a card between, before and after neighbours", () => {
    expect(sortBetween(1, 2)).toBe(1.5);
    expect(sortBetween(null, 3)).toBe(2);
    expect(sortBetween(3, null)).toBe(4);
    expect(sortBetween(null, null)).toBe(0);
  });
});

describe("progress", () => {
  it("counts top-level tasks only", () => {
    const p = progress([t("done"), t("todo"), t("done", null, { parent_id: "x" }), t("doing", null, { estimate_hours: 3 })]);
    expect(p).toMatchObject({ total: 3, done: 1, pct: 33, hours: 5, doneHours: 1 });
  });
  it("is 0% with no tasks", () => expect(progress([]).pct).toBe(0));
});

describe("projectHealth", () => {
  const today = "2026-11-10";
  const p = (due: string | null, status = "active") => ({ status, due_date: due }) as never;
  it("closed projects are closed", () => expect(projectHealth(p("2026-01-01", "done"), [t("todo", "2026-01-01")], today)).toBe("closed"));
  it("late when past the project due date", () => expect(projectHealth(p("2026-11-09"), [], today)).toBe("late"));
  it("late when a task is more than 3 days overdue", () => expect(projectHealth(p(null), [t("todo", "2026-11-06")], today)).toBe("late"));
  it("at risk when a task is just overdue", () => expect(projectHealth(p(null), [t("doing", "2026-11-08")], today)).toBe("at_risk"));
  it("done tasks don't count as overdue", () => expect(projectHealth(p(null), [t("done", "2026-10-01")], today)).toBe("on_track"));
  it("at risk when due within a week and under 75% done", () => {
    expect(projectHealth(p("2026-11-15"), [t("done"), t("todo")], today)).toBe("at_risk");
    expect(projectHealth(p("2026-11-15"), [t("done"), t("done"), t("done"), t("todo")], today)).toBe("on_track");
  });
});

describe("dueBucket", () => {
  const today = "2026-11-10";
  it("buckets by due date", () => {
    expect(dueBucket(null, today)).toBe("no_date");
    expect(dueBucket("2026-11-09", today)).toBe("overdue");
    expect(dueBucket("2026-11-10", today)).toBe("today");
    expect(dueBucket("2026-11-17", today)).toBe("week");
    expect(dueBucket("2026-11-18", today)).toBe("later");
  });
});

describe("mentionedEmails", () => {
  const people = [
    { email: "riya@korakaagaz.co", name: "Riya Sen" },
    { email: "dev.k@gmail.com", name: "" },
    { email: "team@korakaagaz.co", name: "Ashmit" },
  ];
  it("matches first names, email handles and full emails", () => {
    expect(mentionedEmails("@riya can you check? cc @dev.k", people).sort()).toEqual(["dev.k@gmail.com", "riya@korakaagaz.co"]);
    expect(mentionedEmails("ping @team@korakaagaz.co", people)).toEqual(["team@korakaagaz.co"]);
    expect(mentionedEmails("@Ashmit, looks good", people)).toEqual(["team@korakaagaz.co"]);
  });
  it("ignores partial words and plain emails", () => {
    expect(mentionedEmails("@riyaz and riya@korakaagaz.co", people)).toEqual([]);
  });
});

describe("timelineRange", () => {
  it("pads around the dates and includes today", () => {
    expect(timelineRange(["2026-11-20", "2026-11-25", null], "2026-11-10")).toEqual({ from: "2026-11-08", to: "2026-11-28", days: 21 });
  });
});

describe("initials", () => {
  it("uses name parts or the email handle", () => {
    expect(initials("Riya Sen")).toBe("RS");
    expect(initials("dev.k@gmail.com")).toBe("DK");
    expect(initials("")).toBe("?");
  });
});
