import type { CalendarDraftContext } from "@talent-signal/agent";
import { ApiError } from "../lib/apiError.js";

export function calendarDraftContextForRequest(sourceRequestID: string, timeZone: string | undefined, referenceTime: Date): CalendarDraftContext | undefined {
  if (!timeZone) return undefined;
  try { new Intl.DateTimeFormat("en", { timeZone }); }
  catch { throw new ApiError(422, "CALENDAR_TIME_ZONE_INVALID", "Choose a valid calendar timezone."); }
  return { sourceRequestID, timeZone, referenceTime: referenceTime.toISOString() };
}
