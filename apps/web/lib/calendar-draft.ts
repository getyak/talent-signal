import type { CalendarDraft } from "@talent-signal/contracts";

// RFC 5545 §§3.1, 3.3.5, 3.3.11: UTF-8 folding, UTC timestamps and TEXT escaping.
// https://www.rfc-editor.org/rfc/rfc5545
function fold(line: string): string {
  let result = "", width = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).byteLength;
    if (width + bytes > 75) { result += "\r\n "; width = 1; }
    result += character; width += bytes;
  }
  return result;
}
const text = (value: string) => value.replace(/\\/gu, "\\\\").replace(/\r\n|\n|\r/gu, "\\n").replace(/[,;]/gu, "\\$&").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
const date = (value: string) => new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");

export function calendarLocalTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

/** Reject nonexistent or repeated local times instead of silently choosing DST. */
export function calendarUTCFromLocal(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u.test(value)) throw new Error("CALENDAR_LOCAL_TIME_INVALID");
  const normalized = value.length === 16 ? `${value}:00` : value, nominal = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(nominal)) throw new Error("CALENDAR_LOCAL_TIME_INVALID");
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const instant = nominal + hours * 3_600_000;
    offsets.add(Date.parse(`${calendarLocalTime(new Date(instant).toISOString(), timeZone)}Z`) - instant);
  }
  const matches = [...offsets].map(offset => new Date(nominal - offset).toISOString())
    .filter(candidate => calendarLocalTime(candidate, timeZone) === normalized);
  if (matches.length !== 1) throw new Error("CALENDAR_LOCAL_TIME_AMBIGUOUS");
  return matches[0]!;
}

/** Export only title/time. Generating a file is not a saved calendar event. */
export function calendarDraftFile(draft: CalendarDraft): string {
  if (draft.status !== "needs_review" || draft.external_effect !== "none" || !/^[0-9a-f-]{36}$/iu.test(draft.id)
    || Date.parse(draft.ends_at) <= Date.parse(draft.starts_at)) throw new Error("CALENDAR_DRAFT_INVALID");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talent Signal//Calendar draft//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${draft.id}@talent-signal.local`, `DTSTAMP:${date(draft.reference_time)}`,
    `DTSTART:${date(draft.starts_at)}`, `DTEND:${date(draft.ends_at)}`, `SUMMARY:${text(draft.title)}`,
    "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
