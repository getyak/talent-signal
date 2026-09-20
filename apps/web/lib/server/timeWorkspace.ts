import "server-only";

import {
  TalentSignalHttpError, TimeActivityListResponseSchema, TimeScheduleResponseSchema,
  TimeReviewResponseSchema, type TimeScope, type TimeActivityListResponse,
  type TimeScheduleResponse, type TimeScheduleMutationRequest,
  type TimeScheduleDeleteRequest, type TimeReviewRequest, type TimeReviewResponse,
} from "@talent-signal/contracts";
import { matchesTypeBox } from "@/lib/typebox-validation";
import { authenticatedBackendClient } from "./backendAuth";

async function client() {
  const backend = await authenticatedBackendClient();
  if (!backend) throw new TalentSignalHttpError(401, "backend_session_expired", "请重新登录后查看时间记录。", null);
  return backend;
}

function invalid(): never {
  throw new TalentSignalHttpError(502, "time_contract_invalid", "时间记录暂时无法读取，请重试。", null);
}

export async function loadTimeActivities(scope: TimeScope, after?: string): Promise<TimeActivityListResponse> {
  const result = await (await client()).listTimeActivities(scope, after);
  if (!matchesTypeBox(TimeActivityListResponseSchema, result)) invalid();
  return result;
}

function schedule(result: TimeScheduleResponse): TimeScheduleResponse {
  if (!matchesTypeBox(TimeScheduleResponseSchema, result)) invalid();
  return result;
}

export async function loadTimeSchedule(id: string): Promise<TimeScheduleResponse> {
  return schedule(await (await client()).getTimeSchedule(id));
}
export async function saveTimeSchedule(id: string, input: TimeScheduleMutationRequest): Promise<TimeScheduleResponse> {
  return schedule(await (await client()).putTimeSchedule(id, input));
}
export async function removeTimeSchedule(id: string, input: TimeScheduleDeleteRequest): Promise<TimeScheduleResponse> {
  return schedule(await (await client()).deleteTimeSchedule(id, input));
}
export async function reviewTimeScope(input: TimeReviewRequest): Promise<TimeReviewResponse> {
  const result = await (await client()).reviewTimeRange(input);
  if (!matchesTypeBox(TimeReviewResponseSchema, result)) invalid();
  return result;
}
