import { TimeScheduleResponseSchema, type TimeScheduleRecord } from "@talent-signal/contracts";
import { matchesTypeBox } from "./typebox-validation";
import { workspaceSessionFetch } from "@/components/workspace-session-request";

export class TimeRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "") { super(message); }
}
export async function timeRequest(url: string, binding: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("x-workspace-session", binding);
  if (options.body) headers.set("content-type", "application/json");
  const response = await workspaceSessionFetch(url, { ...options, headers, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new TimeRequestError(payload.message || "读取未完成，请重试。", response.status, payload.code);
  if (payload.session_version !== binding) throw new TimeRequestError("登录已改变，请刷新页面。", 409, "session_stale");
  const body = { ...payload };
  delete body.session_version;
  return body;
}
export async function readTimeSchedule(id: string, binding: string, signal?: AbortSignal): Promise<TimeScheduleRecord> {
  const payload = await timeRequest(`/api/time/schedules/${encodeURIComponent(id)}`, binding, { signal });
  if (!matchesTypeBox(TimeScheduleResponseSchema, payload)) throw new Error("安排暂时无法读取。");
  return payload.schedule;
}
export { rememberTimeOperation, pendingTimeOperation, clearTimeOperation, type PendingScheduleReceipt } from "./time-workspace-storage";
