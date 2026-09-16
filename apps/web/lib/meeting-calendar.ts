import type { CalendarDraft, MeetingDraftRecord } from "@talent-signal/contracts";

import { calendarLocalTime } from "./calendar-draft";

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

export type MeetingCalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  draftCount: number;
};

export function mergeMeetingDraftScopeSnapshots(
  reviewable: MeetingDraftRecord[],
  inactive: MeetingDraftRecord[],
): MeetingDraftRecord[] {
  const byID = new Map(reviewable.map((draft) => [draft.id, draft]));
  // Inactive is read after reviewable. A transition between the two snapshots
  // must revoke the stale reviewable projection rather than duplicate it.
  for (const draft of inactive) byID.set(draft.id, draft);
  return [...byID.values()];
}

export function validMeetingMonth(value: string | undefined): string | null {
  if (!value || !MONTH.test(value)) return null;
  const parsed = new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 7) !== value
    ? null
    : value;
}

export function validMeetingDay(value: string | undefined): string | null {
  if (!value || !DAY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

export function meetingDraftLocalDay(draft: MeetingDraftRecord): string | null {
  if (!draft.content_available || !draft.starts_at || !draft.time_zone) return null;
  try {
    return calendarLocalTime(draft.starts_at, draft.time_zone).slice(0, 10);
  } catch {
    return null;
  }
}

export function defaultMeetingDay(drafts: MeetingDraftRecord[]): string | null {
  for (const draft of drafts) {
    if (draft.status !== "needs_review") continue;
    const day = meetingDraftLocalDay(draft);
    if (day) return day;
  }
  return null;
}

export function meetingCalendarDayLabel(input: {
  date: string;
  draftCount: number;
  inMonth: boolean;
}): string {
  const date = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${input.date}T12:00:00Z`));
  const position = input.inMonth ? "" : "，相邻月份";
  const drafts = input.draftCount
    ? `，${input.draftCount} 份待核对草稿`
    : "，没有待核对草稿";
  return `${date}${position}${drafts}`;
}

export function meetingDraftExpiryLabel(draft: MeetingDraftRecord): string {
  if (!draft.time_zone) return "原来源保留期结束";
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "numeric",
      timeZone: draft.time_zone,
      year: "numeric",
    }).formatToParts(new Date(draft.expires_at));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    if (!year || !month || !day) throw new Error("date_parts_missing");
    return `${year}年${month}月${day}日`;
  } catch {
    return "原来源保留期结束";
  }
}

export function meetingDraftCalendarValue(
  draft: MeetingDraftRecord,
): CalendarDraft | null {
  if (
    draft.status !== "needs_review" ||
    !draft.content_available ||
    !draft.title ||
    !draft.starts_at ||
    !draft.ends_at ||
    !draft.time_zone ||
    !draft.source_excerpt ||
    !draft.reference_time
  ) {
    return null;
  }
  return {
    id: draft.id,
    ends_at: draft.ends_at,
    external_effect: "none",
    reference_time: draft.reference_time,
    source_excerpt: draft.source_excerpt,
    source_request_id: draft.source_task_id,
    starts_at: draft.starts_at,
    status: "needs_review",
    time_zone: draft.time_zone,
    title: draft.title,
  };
}

export function meetingCalendarDays(
  month: string,
  drafts: MeetingDraftRecord[],
): MeetingCalendarDay[] {
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const first = new Date(start);
  first.setUTCDate(1 - mondayOffset);
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    const day = meetingDraftLocalDay(draft);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      date: iso,
      day: date.getUTCDate(),
      inMonth: iso.startsWith(month),
      draftCount: counts.get(iso) ?? 0,
    };
  });
}

export function adjacentMeetingMonth(month: string, delta: -1 | 1): string {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 7);
}
