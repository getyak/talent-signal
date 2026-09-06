import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

export const LabTaskKindSchema = Type.Union([
  Type.Literal("relationship_text"), Type.Literal("relationship_image"), Type.Literal("unscoped_chat"),
]);
export const LabPromptPresetSchema = Type.Union([
  Type.Literal("baseline"), Type.Literal("concise"), Type.Literal("evidence_first"),
]);
const NullableText = Type.Union([Type.String(), Type.Null()]);
const NullableCount = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
export const LabTrialMeasurementSchema = Type.Object({
  execution: Type.Union([Type.Literal("remote"), Type.Literal("local_only"), Type.Literal("unknown")]),
  remote_requests_started: NullableCount,
  requested_model: Type.String(), resolved_model: Type.String(), actual_model: NullableText,
  prompt_revision: Type.String(), actual_prompt_revision: NullableText,
  duration_ms: Type.Integer({ minimum: 0 }), input_tokens: NullableCount, output_tokens: NullableCount,
  provider_request_id: NullableText, status: Type.Union([Type.Literal("completed"), Type.Literal("failed")]),
  error_code: NullableText,
}, { additionalProperties: false });
export const LabTrialObservationPlanSchema = Type.Object({
  question: Type.String({ minLength: 1, maxLength: 240 }),
  success_metric: Type.Literal("product_adoption"),
  guardrail_metric: Type.Literal("fallback_or_product_failure"),
  minimum_samples: Type.Union([Type.Literal(3), Type.Literal(5), Type.Literal(10), Type.Literal(20)]),
  stop_after_adverse_outcomes: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
  sample_unit: Type.Literal("unique_product_request"),
  assignment_mode: Type.Literal("current_authenticated_session_opt_in"),
  rollback: Type.Literal("task_default"),
  window_minutes: Type.Union([Type.Literal(5), Type.Literal(15), Type.Literal(30), Type.Literal(60)]),
}, { additionalProperties: false });
export const LabTaskTrialRequestSchema = Type.Object({
  id: Type.String({ format: "uuid" }), task: LabTaskKindSchema,
  model: Type.String({ minLength: 1, maxLength: 100 }), prompt_preset: LabPromptPresetSchema,
  duration_minutes: Type.Union([Type.Literal(5), Type.Literal(15), Type.Literal(30), Type.Literal(60)]),
  replaces_trial_id: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  observation_plan: Type.Optional(LabTrialObservationPlanSchema),
}, { additionalProperties: false });
export const LabTaskTrialSchema = Type.Object({
  session_scope_id: Type.String(),
  id: Type.String({ format: "uuid" }), task: LabTaskKindSchema, model: Type.String(),
  prompt_preset: LabPromptPresetSchema, prompt_revision: Type.String(),
  backend_revision: NullableText,
  status: Type.Union([Type.Literal("active"), Type.Literal("stopped"), Type.Literal("expired")]),
  created_at: Type.String(), expires_at: Type.String(),
  scope: Type.Literal("this_authenticated_session"),
  online_assignment: Type.Literal(false),
  observation_plan: LabTrialObservationPlanSchema,
  stop_reason: Type.Union([Type.Literal("manual"), Type.Literal("replaced"), Type.Literal("expired"),
    Type.Literal("guardrail"), Type.Literal("unknown"), Type.Null()]),
}, { additionalProperties: false });
export const LabTrialObservationSchema = Type.Object({
  id: Type.String({ format: "uuid" }), trial_id: Type.String({ format: "uuid" }), task: LabTaskKindSchema,
  observed_at: Type.String(), measurement: LabTrialMeasurementSchema,
  product_outcome: Type.Optional(Type.Union([Type.Literal("accepted"), Type.Literal("fallback"),
    Type.Literal("product_failed"), Type.Literal("unverified")])),
}, { additionalProperties: false });
export const LabTrialSummarySchema = Type.Object({
  trial_id: Type.String({ format: "uuid" }),
  samples: Type.Integer({ minimum: 0 }),
  accepted: Type.Integer({ minimum: 0 }),
  fallback: Type.Integer({ minimum: 0 }),
  product_failed: Type.Integer({ minimum: 0 }),
  unverified: Type.Integer({ minimum: 0 }),
  remote_executions: Type.Integer({ minimum: 0 }),
  local_executions: Type.Integer({ minimum: 0 }),
  evidence_state: Type.Union([Type.Literal("collecting"), Type.Literal("minimum_reached"),
    Type.Literal("outcomes_incomplete"), Type.Literal("ended_below_minimum"), Type.Literal("guardrail_stopped")]),
  causal_claim_allowed: Type.Literal(false),
}, { additionalProperties: false });
export const LabTaskConfigurationSchema = Type.Object({
  session_scope_id: Type.String(),
  contract_version: Type.Literal(CONTRACT_VERSION),
  enabled: Type.Boolean(), backend_revision: NullableText,
  tasks: Type.Array(Type.Object({
    id: LabTaskKindSchema,
    models: Type.Array(Type.Object({ id: Type.String(), prompt_presets: Type.Array(LabPromptPresetSchema) }, { additionalProperties: false })),
    default_model: NullableText,
  }, { additionalProperties: false })),
  trials: Type.Array(LabTaskTrialSchema),
  observations: Type.Array(LabTrialObservationSchema),
  summaries: Type.Array(LabTrialSummarySchema),
}, { additionalProperties: false });
export const LabTaskTrialResponseSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION), trial: LabTaskTrialSchema,
}, { additionalProperties: false });
export type LabTaskTrialRequest = Static<typeof LabTaskTrialRequestSchema>;
export type LabPromptPreset = Static<typeof LabPromptPresetSchema>;
export type LabTaskTrial = Static<typeof LabTaskTrialSchema>;
export type LabTrialObservation = Static<typeof LabTrialObservationSchema>;
export type LabTrialObservationPlan = Static<typeof LabTrialObservationPlanSchema>;
export type LabTrialSummary = Static<typeof LabTrialSummarySchema>;
