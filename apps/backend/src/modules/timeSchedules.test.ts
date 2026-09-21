import { describe, expect, it } from "vitest";

import type { TimeScheduleMutationRequest } from "@talent-signal/contracts";

import { ApiError } from "../lib/apiError.js";
import { isLocalMidnight, normalizeScheduleInput } from "./timeSchedules.js";

function input(
  overrides: Partial<TimeScheduleMutationRequest> = {},
): TimeScheduleMutationRequest {
  return {
    expected_revision: 0,
    idempotency_key: "33333333-3333-4333-8333-333333333333",
    title: "Intro call",
    note: "Prepare notes",
    kind: "meeting",
    person_id: null,
    starts_at: "2026-03-08T15:00:00.000Z",
    ends_at: "2026-03-08T16:00:00.000Z",
    time_zone: "America/New_York",
    all_day: false,
    status: "planned",
    reminder_minutes: 15,
    ...overrides,
  };
}

describe("time schedule validation", () => {
  it("normalizes a valid planned interval", () => {
    const normalized = normalizeScheduleInput(input());
    expect(normalized.starts_at).toBe("2026-03-08T15:00:00.000Z");
    expect(normalized.ends_at).toBe("2026-03-08T16:00:00.000Z");
    expect(normalized.status).toBe("planned");
  });

  it("rejects an inverted or oversized interval", () => {
    expect(() =>
      normalizeScheduleInput(
        input({ starts_at: "2026-03-08T16:00:00.000Z" }),
      ),
    ).toThrowError(ApiError);
    expect(() =>
      normalizeScheduleInput(
        input({ ends_at: "2026-03-20T16:00:00.000Z" }),
      ),
    ).toThrowError(ApiError);
  });

  it("rejects an unknown time zone and unsupported reminder", () => {
    expect(() =>
      normalizeScheduleInput(input({ time_zone: "Mars/Olympus" })),
    ).toThrowError(ApiError);
    expect(() =>
      normalizeScheduleInput(
        input({ reminder_minutes: 7 as TimeScheduleMutationRequest["reminder_minutes"] }),
      ),
    ).toThrowError(ApiError);
  });

  it("rejects a blank title and a future completed event", () => {
    expect(() => normalizeScheduleInput(input({ title: "   " }))).toThrowError(
      ApiError,
    );
    expect(() =>
      normalizeScheduleInput(
        input({
          status: "completed",
          starts_at: "2999-01-01T00:00:00.000Z",
          ends_at: "2999-01-01T01:00:00.000Z",
        }),
      ),
    ).toThrowError(ApiError);
  });

  it("requires all-day intervals on local midnights, including across DST", () => {
    expect(isLocalMidnight("2026-03-08T05:00:00.000Z", "America/New_York")).toBe(
      true,
    );
    expect(isLocalMidnight("2026-03-09T04:00:00.000Z", "America/New_York")).toBe(
      true,
    );
    expect(
      isLocalMidnight("2026-03-08T15:00:00.000Z", "America/New_York"),
    ).toBe(false);
    const allDay = normalizeScheduleInput(
      input({
        all_day: true,
        starts_at: "2026-03-08T05:00:00.000Z",
        ends_at: "2026-03-09T04:00:00.000Z",
      }),
    );
    expect(allDay.all_day).toBe(true);
    expect(() =>
      normalizeScheduleInput(
        input({
          all_day: true,
          starts_at: "2026-03-08T05:00:00.000Z",
          ends_at: "2026-03-08T06:00:00.000Z",
        }),
      ),
    ).toThrowError(ApiError);
  });
});
