import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

/**
 * A persistent projection of a CalendarDraft value produced by a session-bound
 * chat task. It is a reviewable proposal with external_effect='none'. It is
 * never a confirmed calendar event and never an execution receipt.
 */
const obj = { additionalProperties: false } as const;
const id = Type.String({ format: "uuid" });
const stamp = Type.String({ format: "date-time" });

const MeetingDraftStatusSchema = Type.Union([
  Type.Literal("needs_review"),
  Type.Literal("dismissed"),
  Type.Literal("expired"),
  Type.Literal("redacted"),
]);

/**
 * Content is returned only while the draft is current (`needs_review`) and its
 * source authority holds. Redacted, dismissed, or expired drafts expose only a
 * non-sensitive tombstone with the sensitive fields nulled.
 */
export const MeetingDraftRecordSchema = Type.Object(
  {
    id,
    status: MeetingDraftStatusSchema,
    external_effect: Type.Literal("none"),
    revision: Type.Integer({ minimum: 1 }),
    source_task_id: Type.String({ minLength: 1, maxLength: 200 }),
    origin_session_id: id,
    created_at: stamp,
    updated_at: stamp,
    expires_at: stamp,
    content_available: Type.Boolean(),
    title: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    starts_at: Type.Union([stamp, Type.Null()]),
    ends_at: Type.Union([stamp, Type.Null()]),
    time_zone: Type.Union([Type.String({ maxLength: 100 }), Type.Null()]),
    source_excerpt: Type.Union([Type.String({ maxLength: 1000 }), Type.Null()]),
    reference_time: Type.Union([stamp, Type.Null()]),
    redacted_at: Type.Union([stamp, Type.Null()]),
    dismissed_at: Type.Union([stamp, Type.Null()]),
  },
  obj,
);
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
    next_cursor: Type.Union([id, Type.Null()]),
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
