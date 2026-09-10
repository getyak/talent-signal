import { describe, expect, it } from "vitest";
import { calendarDraftFile, calendarUTCFromLocal } from "./calendar-draft";
import type { CalendarDraft } from "@talent-signal/contracts";
const draft: CalendarDraft = { id: "10000000-0000-4000-8000-000000000001", title: "与陈夏会谈", starts_at: "2026-09-10T07:00:00.000Z", ends_at: "2026-09-10T07:30:00.000Z",
  time_zone: "Asia/Shanghai", source_request_id: "10000000-0000-4000-8000-000000000002", source_excerpt: "private source omitted from calendar export", reference_time: "2026-09-09T02:00:00.000Z", status: "needs_review", external_effect: "none" };
describe("calendar file projection", () => {
  it("uses the draft timezone for edits and rejects DST gaps and overlaps", () => {
    expect(calendarUTCFromLocal("2026-09-10T15:00", "Asia/Shanghai")).toBe("2026-09-10T07:00:00.000Z");
    expect(() => calendarUTCFromLocal("2026-03-08T02:30", "America/New_York")).toThrow("CALENDAR_LOCAL_TIME_AMBIGUOUS");
    expect(() => calendarUTCFromLocal("2026-11-01T01:30", "America/New_York")).toThrow("CALENDAR_LOCAL_TIME_AMBIGUOUS");
    expect(() => calendarUTCFromLocal("2026-02-30T12:00", "Asia/Shanghai")).toThrow();
  });
  it("exports UTC time and title without source prose or invitation fields", () => {
    const file = calendarDraftFile(draft);
    expect(file).toContain("DTSTART:20260910T070000Z\r\nDTEND:20260910T073000Z");
    expect(file).not.toContain(draft.source_excerpt);
    expect(file).not.toMatch(/ATTENDEE|ORGANIZER|DESCRIPTION|VALARM/u);
  });
  it("escapes line injection and folds long UTF-8 without splitting characters", () => {
    const title = "陈夏".repeat(40) + "\r\nATTENDEE:mailto:wrong@example.invalid; a,b\\c";
    const file = calendarDraftFile({ ...draft, title });
    expect(file.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(file).not.toContain("\r\nATTENDEE:");
    const unfolded = file.replace(/\r\n /gu, "");
    expect(unfolded).toContain("\\nATTENDEE:mailto:wrong@example.invalid\\; a\\,b\\\\c");
    expect(unfolded).toContain("陈夏".repeat(40));
  });
});
