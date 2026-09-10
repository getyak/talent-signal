import { Type, type Static } from "@sinclair/typebox";

/** A reviewable proposal, never an external execution receipt. */
export const CalendarDraftSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  starts_at: Type.String({ format: "date-time" }),
  ends_at: Type.String({ format: "date-time" }),
  time_zone: Type.String({ minLength: 1, maxLength: 100 }),
  source_request_id: Type.String({ format: "uuid" }),
  source_excerpt: Type.String({ minLength: 1, maxLength: 1000 }),
  reference_time: Type.String({ format: "date-time" }),
  status: Type.Literal("needs_review"),
  external_effect: Type.Literal("none"),
}, { additionalProperties: false });
export type CalendarDraft = Static<typeof CalendarDraftSchema>;
