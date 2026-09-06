import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";
import { LabPromptPresetSchema } from "./labRuntimeSchemas.js";
import { PromptSnapshotSchema } from "./promptSchemas.js";

const TextOrNull = Type.Union([Type.String(), Type.Null()]);
const CountOrNull = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
export const LabJobTaskSchema = Type.Union(([
  "relationship_text", "relationship_image", "unscoped_chat",
] as const).map((value) => Type.Literal(value)));
export const LabJobStatusSchema = Type.Union((["queued", "running", "cancelling", "cancelled", "completed", "partial", "failed", "unknown"] as const).map((value) => Type.Literal(value)));
export const LabAttemptStatusSchema = Type.Union((["pending", "dispatching", "completed", "failed", "cancelled", "unknown"] as const).map((value) => Type.Literal(value)));
export const LabFailureCategorySchema = Type.Union((["unsupported_claim", "wrong_identity", "missed_uncertainty", "stale_evidence", "unsafe_action", "bad_structure", "provider_failure", "latency", "other"] as const).map((value) => Type.Literal(value)));
export const LabRegressionSourceSchema = Type.Object({ id: Type.String({ format: "uuid" }), content_hash: Type.String({ pattern: "^[a-f0-9]{64}$" }) }, { additionalProperties: false });
export const LabJobRequestSchema = Type.Object({
  catalog_revision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  task: Type.Optional(LabJobTaskSchema),
  id: Type.String({ format: "uuid" }), case_ids: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 20, uniqueItems: true }),
  configurations: Type.Array(Type.Object({ model: Type.String({ minLength: 1, maxLength: 100 }), prompt_preset: LabPromptPresetSchema }, { additionalProperties: false }), { minItems: 2, maxItems: 2 }),
  repetitions: Type.Integer({ minimum: 1, maximum: 3 }), call_limit: Type.Integer({ minimum: 2, maximum: 120 }),
  regression_source: Type.Optional(LabRegressionSourceSchema),
}, { additionalProperties: false });
export const LabJobCaseSchema = Type.Object({
  task: Type.Optional(LabJobTaskSchema),
  id: Type.String(), title: Type.String(), revision: Type.String(), partition: Type.Union([Type.Literal("development"), Type.Literal("held_out")]),
  input_json: Type.String(), input_hash: Type.String(), expected: Type.String(),
}, { additionalProperties: false });
export const LabJobDefinitionSchema = Type.Object({
  task: LabJobTaskSchema, cases: Type.Array(LabJobCaseSchema),
  configurations: Type.Array(Type.Object({ model: Type.String(), prompt_preset: LabPromptPresetSchema, prompt_revision: Type.String(), prompt_snapshot: Type.Optional(PromptSnapshotSchema) }, { additionalProperties: false })),
  comparison: Type.Union((["repeatability", "model", "prompt", "combined"] as const).map((value) => Type.Literal(value))),
  repetitions: Type.Integer(), call_limit: Type.Integer(), max_output_tokens_per_call: Type.Literal(1600),
  reference_time: Type.String(), backend_revision: TextOrNull, instrument_revision: Type.String(),
  tool_access: Type.Array(Type.Literal("contact_workspace"), { maxItems: 1, uniqueItems: true }), business_write_count: Type.Literal(0), cost_status: Type.Literal("unavailable"),
  regression_source: Type.Optional(LabRegressionSourceSchema),
}, { additionalProperties: false });
export const LabJobCheckSchema = Type.Object({
  id: Type.String(), verdict: Type.Union((["pass", "fail", "unknown", "skipped"] as const).map((value) => Type.Literal(value))), summary: Type.String(),
}, { additionalProperties: false });
export const LabJobAttemptSchema = Type.Object({
  id: Type.String({ format: "uuid" }), ordinal: Type.Integer(), case_id: Type.String(), configuration_index: Type.Integer(), repetition: Type.Integer({ minimum: 1 }),
  status: LabAttemptStatusSchema, started_at: TextOrNull, finished_at: TextOrNull,
  requested_model: Type.String(), actual_model: TextOrNull, prompt_revision: Type.String(), actual_prompt_revision: TextOrNull,
  execution: Type.Optional(Type.Union([Type.Literal("remote"), Type.Literal("local_only"), Type.Literal("unknown")])),
  remote_requests_started: Type.Optional(CountOrNull),
  provider_request_id: TextOrNull, duration_ms: CountOrNull, input_tokens: CountOrNull, output_tokens: CountOrNull,
  title: TextOrNull, answer: TextOrNull, citation_ids: Type.Array(Type.String()), error_code: TextOrNull,
  checks: Type.Array(LabJobCheckSchema),
}, { additionalProperties: false });
export const LabJobSchema = Type.Object({
  id: Type.String({ format: "uuid" }), definition_hash: Type.String(), definition: LabJobDefinitionSchema,
  status: LabJobStatusSchema, attempts: Type.Array(LabJobAttemptSchema), calls_reserved: Type.Integer({ minimum: 0 }),
  created_at: Type.String(), expires_at: Type.String(), cancel_requested_at: TextOrNull,
  review: Type.Union((["unreviewed", "a", "b", "tie", "inconclusive"] as const).map((value) => Type.Literal(value))),
  failure_categories: Type.Array(LabFailureCategorySchema), quality: Type.Union([Type.Literal("blocked"), Type.Literal("needs_review")]),
}, { additionalProperties: false });
export const LabJobResponseSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), job: LabJobSchema }, { additionalProperties: false });
export const LabJobReviewSchema = Type.Object({
  review: Type.Union((["a", "b", "tie", "inconclusive"] as const).map((value) => Type.Literal(value))), failure_categories: Type.Array(LabFailureCategorySchema, { uniqueItems: true, maxItems: 9 }),
}, { additionalProperties: false });
export const LabJobSummarySchema = Type.Object({
  id: Type.String({ format: "uuid" }), status: LabJobStatusSchema, created_at: Type.String(), expires_at: Type.String(),
  task: Type.Optional(LabJobTaskSchema),
  case_count: Type.Integer(), repetitions: Type.Integer(), planned_calls: Type.Integer(), calls_reserved: Type.Integer(),
  models: Type.Array(Type.String()), review: Type.String(),
}, { additionalProperties: false });
export const LabJobCatalogSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION), catalog_revision: Type.String(), enabled: Type.Boolean(), cases: Type.Array(LabJobCaseSchema),
  models: Type.Array(Type.Object({ task: Type.Optional(LabJobTaskSchema), id: Type.String(), prompt_presets: Type.Array(LabPromptPresetSchema) }, { additionalProperties: false })),
  jobs: Type.Array(LabJobSummarySchema), daily_call_limit: Type.Integer(), daily_calls_reserved: Type.Integer(),
}, { additionalProperties: false });
export type LabJobRequest = Static<typeof LabJobRequestSchema>;
export type LabJobTask = Static<typeof LabJobTaskSchema>;
export type LabJobDefinition = Static<typeof LabJobDefinitionSchema>;
export type LabJobCase = Static<typeof LabJobCaseSchema>;
export type LabJob = Static<typeof LabJobSchema>;
export type LabJobResponse = Static<typeof LabJobResponseSchema>;
export type LabJobAttempt = Static<typeof LabJobAttemptSchema>;
export type LabJobReview = Static<typeof LabJobReviewSchema>;
export type LabFailureCategory = Static<typeof LabFailureCategorySchema>;
export type LabJobSummary = Static<typeof LabJobSummarySchema>;
export type LabJobCatalog = Static<typeof LabJobCatalogSchema>;
