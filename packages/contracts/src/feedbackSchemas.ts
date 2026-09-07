import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

const ID = Type.String({ format: "uuid" });
const Hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
const NullableID = Type.Union([ID, Type.Null()]);
const TextOrNull = Type.Union([Type.String(), Type.Null()]);
const Revision = Type.Integer({ minimum: 0 });
const obj = { additionalProperties: false };
export const FeedbackCategorySchema = Type.Union(([
  "fact_error", "wrong_identity", "wrong_time", "unsupported_suggestion",
  "preference", "later_change", "helpful", "unhelpful", "click",
] as const).map((value) => Type.Literal(value)));
export const FeedbackSourceStateSchema = Type.Union(([
  "available", "source_deleted", "source_expired", "wrong_identity", "source_unavailable", "snapshot_unavailable",
] as const).map((value) => Type.Literal(value)));
export const FeedbackMutationSchema = Type.Object({
  idempotency_key: ID, expected_revision: Revision,
  session_id: ID, turn_id: ID, expected_session_revision: Type.Integer({ minimum: 1 }),
  execution_id: ID, output_hash: Hash,
  operation: Type.Union([Type.Literal("submit"), Type.Literal("withdraw")]),
  category: FeedbackCategorySchema,
  expected_behavior_proposal: Type.String({ maxLength: 2000 }),
}, obj);
export const FeedbackRecordSchema = Type.Object({
  id: ID, revision: Type.Integer({ minimum: 1 }),
  actor_id: ID, session_id: ID, turn_id: ID, execution_id: ID, task_id: ID,
  output_hash: Hash, source_state: FeedbackSourceStateSchema,
  category: FeedbackCategorySchema, status: Type.Union([Type.Literal("active"), Type.Literal("withdrawn")]),
  expected_behavior_proposal: TextOrNull, adjudication: Type.Literal("proposed"),
  regression_id: NullableID, created_at: Type.String(), updated_at: Type.String(), expires_at: Type.String(),
}, obj);
export const FeedbackSourceSchema = Type.Object({
  session_id: ID, turn_id: ID, session_revision: Type.Integer({ minimum: 1 }),
  task_id: ID, execution_id: NullableID, output_hash: Type.Union([Hash, Type.Null()]),
  source_state: FeedbackSourceStateSchema, reference_time: TextOrNull,
  model: TextOrNull, prompt_revision: TextOrNull, backend_revision: TextOrNull,
  legacy_feedback: Type.Union([Type.Literal("helpful"), Type.Literal("unhelpful"), Type.Null()]),
}, obj);
export const FeedbackResponseSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), feedback: FeedbackRecordSchema }, obj);
export const FeedbackSourceResponseSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), source: FeedbackSourceSchema }, obj);

// This is an owner observation of a later product exposure, never a causal hiring outcome.
export const FeedbackObservationRequestSchema = Type.Object({
  id: ID, idempotency_key: ID, expected_feedback_revision: Type.Integer({ minimum: 1 }),
  later_execution_id: ID, later_output_hash: Hash,
  window_start: Type.String({ format: "date-time" }), window_end: Type.String({ format: "date-time" }),
  observed_at: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  outcome: Type.Union(([
    "same_issue", "no_issue_observed", "missing", "late", "censored",
  ] as const).map((value) => Type.Literal(value))),
}, obj);
export const FeedbackObservationSchema = Type.Object({
  id: ID, feedback_id: ID, feedback_revision: Type.Integer({ minimum: 1 }),
  actor_id: ID, original_execution_id: ID, later_execution_id: ID,
  later_task_id: ID, later_output_hash: Hash,
  original_prompt_revision: TextOrNull, later_prompt_revision: TextOrNull,
  original_backend_revision: TextOrNull, later_backend_revision: TextOrNull,
  window_start: Type.String(), window_end: Type.String(), observed_at: TextOrNull,
  reported_outcome: FeedbackObservationRequestSchema.properties.outcome,
  assessment: Type.Union([Type.Literal("issue_observed"), Type.Literal("no_issue_observed_in_window"), Type.Literal("unknown")]),
  source_state: FeedbackSourceStateSchema, followup_regression_id: NullableID,
  causal_claim: Type.Literal("none"), adjudication: Type.Literal("owner_observation"), created_at: Type.String(),
}, obj);
export const FeedbackObservationResponseSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), observation: FeedbackObservationSchema }, obj);
export type FeedbackCategory = Static<typeof FeedbackCategorySchema>;
export type FeedbackSourceState = Static<typeof FeedbackSourceStateSchema>;
export type FeedbackMutation = Static<typeof FeedbackMutationSchema>;
export type FeedbackRecord = Static<typeof FeedbackRecordSchema>;
export type FeedbackSource = Static<typeof FeedbackSourceSchema>;
export type FeedbackObservationRequest = Static<typeof FeedbackObservationRequestSchema>;
export type FeedbackObservation = Static<typeof FeedbackObservationSchema>;
