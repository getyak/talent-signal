import { describe, expect, it } from "vitest";
import { timeScheduleFile } from "./time-schedule-file";
import { timeFixtureSchedule } from "./test/time-fixtures";

describe("calendar file scope and semantics", () => {
  it("exports only approved title/time fields and escapes injected properties", () => {
    const result = timeScheduleFile({ ...timeFixtureSchedule, title: "Meeting\nATTENDEE:someone@example.com,二;三\\四" });
    expect(result).toContain("DTSTART:20260921T010000Z");
    expect(result).toContain("SUMMARY:Meeting\\nATTENDEE:someone@example.com\\,二\\;三\\\\四");
    expect(result).not.toContain("\r\nATTENDEE:");
    expect(result).not.toContain("Private note");
    expect(result).not.toContain("BEGIN:VALARM");
    expect(result).not.toContain("METHOD:REQUEST");
  });
  it("uses exclusive local dates for all-day events and only explicit alarms", () => {
    const result = timeScheduleFile({ ...timeFixtureSchedule, starts_at: "2026-09-20T16:00:00.000Z", ends_at: "2026-09-22T16:00:00.000Z", all_day: true, reminder_minutes: 15 });
    expect(result).toContain("DTSTART;VALUE=DATE:20260921\r\nDTEND;VALUE=DATE:20260923");
    expect(result).toContain("TRIGGER:-PT15M");
  });
  it("folds UTF-8 at 75 octets without changing text", () => {
    const title = "会面，确认下一步。".repeat(15);
    const result = timeScheduleFile({ ...timeFixtureSchedule, title });
    for (const line of result.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(result.replaceAll("\r\n ", "")).toContain(`SUMMARY:${title}`);
  });
  it.each(["deleted", "cancelled", "completed"] as const)("blocks %s records", (status) => {
    expect(() => timeScheduleFile({ ...timeFixtureSchedule, status })).toThrow("SCHEDULE_NOT_EXPORTABLE");
  });
});
