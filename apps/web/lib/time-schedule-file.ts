import type { TimeScheduleRecord } from "@talent-signal/contracts";
import { dateInZone } from "./time-workspace";

const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const text = (value: string) => value.replace(/\\/gu, "\\\\").replace(/\r\n|\n|\r/gu, "\\n").replace(/[,;]/gu, "\\$&").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "");
function fold(line: string): string {
  let result = "", width = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length;
    if (width + bytes > 75) { result += "\r\n "; width = 1; }
    result += character; width += bytes;
  }
  return result;
}
/** No notes, people or attendees leave the app. Import remains a user decision. */
export function timeScheduleFile(record: TimeScheduleRecord): string {
  if (!record.content_available || record.status !== "planned" || !record.title || !record.starts_at || !record.ends_at || !record.time_zone) throw new Error("SCHEDULE_NOT_EXPORTABLE");
  const timing = record.all_day
    ? [`DTSTART;VALUE=DATE:${dateInZone(record.starts_at, record.time_zone).replaceAll("-", "")}`, `DTEND;VALUE=DATE:${dateInZone(record.ends_at, record.time_zone).replaceAll("-", "")}`]
    : [`DTSTART:${stamp(record.starts_at)}`, `DTEND:${stamp(record.ends_at)}`];
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talent Signal//Personal schedule//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${record.id}@talent-signal.local`, `DTSTAMP:${stamp(record.updated_at)}`, `SEQUENCE:${record.revision}`, ...timing, `SUMMARY:${text(record.title)}`,
    ...(record.reminder_minutes === null ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Reminder", `TRIGGER:-PT${record.reminder_minutes}M`, "END:VALARM"]),
    "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
