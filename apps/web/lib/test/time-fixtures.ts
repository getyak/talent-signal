import { CONTRACT_VERSION, type TimeActivity, type TimeScheduleRecord, type TimeScheduleMutationRequest } from "@talent-signal/contracts";
export const timeFixtureId = "b1000000-0000-4000-8000-000000000001";
export const timeFixtureOperationId = "b2000000-0000-4000-8000-000000000001";
export const timeFixtureSchedule: TimeScheduleRecord = {
  id: timeFixtureId, revision: 1, last_operation_id: timeFixtureOperationId,
  created_at: "2026-09-20T01:00:00.000Z", updated_at: "2026-09-20T01:00:00.000Z",
  status: "planned", content_available: true, title: "Synthetic meeting", note: "Private note", kind: "meeting",
  person_id: null, person_label: null, starts_at: "2026-09-21T01:00:00.000Z", ends_at: "2026-09-21T01:30:00.000Z",
  time_zone: "Asia/Shanghai", all_day: false, reminder_minutes: null, authority: "user_authored", external_effect: "none",
};
export const timeFixtureMutation: TimeScheduleMutationRequest = {
  expected_revision: 0, idempotency_key: timeFixtureOperationId, title: "Synthetic meeting", note: "Private note", kind: "meeting",
  person_id: null, starts_at: "2026-09-21T01:00:00.000Z", ends_at: "2026-09-21T01:30:00.000Z", time_zone: "Asia/Shanghai",
  all_day: false, reminder_minutes: null, status: "planned",
};
export const timeFixtureActivity: TimeActivity = {
  id: `schedule:${timeFixtureId}`, kind: "schedule", source_id: timeFixtureId, source_revision: 1, title: "Synthetic meeting", summary: "",
  occurred_at: timeFixtureSchedule.starts_at!, recorded_at: timeFixtureSchedule.created_at, ends_at: timeFixtureSchedule.ends_at,
  local_day: "2026-09-21", time_zone: "Asia/Shanghai", all_day: false, person_id: null, person_label: null,
  relationship_context_id: null, context_label: null, session_id: null, status: "planned", authority: "user_authored", external_effect: "none",
};
export const timeFixtureResponse = { contract_version: CONTRACT_VERSION, schedule: timeFixtureSchedule };
