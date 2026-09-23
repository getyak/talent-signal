import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";
import { CalendarDraftSchema } from "./calendarDraftSchemas.js";

/**
 * A persistent projection of a CalendarDraft value produced by a session-bound
 * chat task. It is a reviewable proposal with external_effect='none'. It is
 * never a confirmed calendar event and never an execution receipt.
 */
const obj = { additionalProperties: false } as const;
const id = Type.String({ format: "uuid" });
const stamp = Type.String({ format: "date-time" });

export const MeetingDraftListScopeSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("reviewable"),
  Type.Literal("inactive"),
]);
export type MeetingDraftListScope = Static<typeof MeetingDraftListScopeSchema>;

/**
 * Content remains reviewable for `needs_review` and visible after an explicit
 * dismissal until its original retention boundary. Revoked-source and expired
 * records expose only a non-sensitive tombstone.
 */
const baseRecord = {
  id,
  external_effect: Type.Literal("none"),
  revision: Type.Integer({ minimum: 1 }),
  source_task_id: id,
  origin_session_id: id,
  created_at: stamp,
  updated_at: stamp,
  expires_at: stamp,
} as const;
const availableContent = {
  content_available: Type.Literal(true),
  title: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
  starts_at: stamp,
  ends_at: stamp,
  time_zone: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
  source_excerpt: Type.String({ minLength: 1, maxLength: 1000, pattern: "\\S" }),
  reference_time: stamp,
  source_image: CalendarDraftSchema.properties.source_image,
  redacted_at: Type.Null(),
} as const;
const unavailableContent = {
  content_available: Type.Literal(false),
  title: Type.Null(),
  starts_at: Type.Null(),
  ends_at: Type.Null(),
  time_zone: Type.Null(),
  source_excerpt: Type.Null(),
  reference_time: Type.Null(),
  redacted_at: stamp,
  dismissed_at: Type.Union([stamp, Type.Null()]),
} as const;

export const MeetingDraftRecordSchema = Type.Union([
  Type.Object({
    ...baseRecord,
    ...availableContent,
    status: Type.Literal("needs_review"),
    dismissed_at: Type.Null(),
  }, obj),
  Type.Object({
    ...baseRecord,
    ...availableContent,
    status: Type.Literal("dismissed"),
    dismissed_at: stamp,
  }, obj),
  Type.Object({
    ...baseRecord,
    ...unavailableContent,
    status: Type.Literal("expired"),
  }, obj),
  Type.Object({
    ...baseRecord,
    ...unavailableContent,
    status: Type.Literal("redacted"),
  }, obj),
]);
export type MeetingDraftRecord = Static<typeof MeetingDraftRecordSchema>;

export const MeetingDraftResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    draft: MeetingDraftRecordSchema,
  },
  obj,
);
export type MeetingDraftResponse = Static<typeof MeetingDraftResponseSchema>;

export const MeetingDraftListResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    drafts: Type.Array(MeetingDraftRecordSchema, { maxItems: 50 }),
    complete: Type.Boolean(),
    next_cursor: Type.Union([
      Type.String({
        minLength: 1,
        maxLength: 1024,
        pattern: "^[A-Za-z0-9_-]+$",
      }),
      Type.Null(),
    ]),
  },
  obj,
);
export type MeetingDraftListResponse = Static<
  typeof MeetingDraftListResponseSchema
>;

export const MeetingDraftDismissRequestSchema = Type.Object(
  {
    expected_revision: Type.Integer({ minimum: 1 }),
    idempotency_key: id,
  },
  obj,
);
export type MeetingDraftDismissRequest = Static<
  typeof MeetingDraftDismissRequestSchema
>;

export const MeetingDraftUpdateRequestSchema = Type.Object(
  {
    expected_revision: Type.Integer({ minimum: 1 }),
    idempotency_key: id,
    title: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
    starts_at: stamp,
    ends_at: stamp,
  },
  obj,
);
export type MeetingDraftUpdateRequest = Static<
  typeof MeetingDraftUpdateRequestSchema
>;
