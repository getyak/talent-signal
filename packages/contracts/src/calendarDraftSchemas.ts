import { Type, type Static } from "@sinclair/typebox";

/** A reviewable proposal, never an external execution receipt. */
export const CalendarDraftSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  title: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
  starts_at: Type.String({ format: "date-time" }),
  ends_at: Type.String({ format: "date-time" }),
  time_zone: Type.String({ minLength: 1, maxLength: 100, pattern: "\\S" }),
  source_request_id: Type.String({ format: "uuid" }),
  source_excerpt: Type.String({ minLength: 1, maxLength: 1000, pattern: "\\S" }),
  reference_time: Type.String({ format: "date-time" }),
  status: Type.Literal("needs_review"),
  external_effect: Type.Literal("none"),
}, { additionalProperties: false });
export type CalendarDraft = Static<typeof CalendarDraftSchema>;
