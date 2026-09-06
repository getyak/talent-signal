import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";
import { PromptSnapshotSchema } from "./promptSchemas.js";

const NullableText = Type.Union([Type.String(), Type.Null()]);
const NullableCount = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);
export const LabModelResultSchema = Type.Object({
  model: Type.String(),
  status: Type.Union([Type.Literal("completed"), Type.Literal("failed")]),
  duration_ms: Type.Integer({ minimum: 0 }),
  answer: NullableText,
  title: NullableText,
  kind: NullableText,
  citation_ids: Type.Array(Type.String()),
  provider_request_id: NullableText,
  input_tokens: NullableCount,
  output_tokens: NullableCount,
  error_code: NullableText,
}, { additionalProperties: false });

export const LabExperimentSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  case_id: Type.String(),
  case_revision: Type.String(),
  snapshot_hash: Type.String(),
  prompt_version: Type.String(),
  prompt_snapshot: Type.Optional(PromptSnapshotSchema),
  backend_revision: NullableText,
  models: Type.Array(Type.String(), { minItems: 2, maxItems: 2 }),
  status: Type.Union([
    Type.Literal("running"), Type.Literal("completed"),
    Type.Literal("partial"), Type.Literal("failed"), Type.Literal("unknown"),
  ]),
  results: Type.Array(LabModelResultSchema, { maxItems: 2 }),
  review: Type.Union([Type.Literal("unreviewed"), Type.Literal("needs_review"),
    Type.Literal("a"), Type.Literal("b"), Type.Literal("tie")]),
  created_at: Type.String(),
  expires_at: Type.String(),
  provider_call_limit: Type.Literal(2),
  business_write_count: Type.Literal(0),
  cost_status: Type.Literal("unavailable"),
}, { additionalProperties: false });

export const LabExperimentRequestSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  case_id: Type.String({ maxLength: 100 }),
  models: Type.Array(Type.String({ maxLength: 100 }), { minItems: 2, maxItems: 2 }),
}, { additionalProperties: false });
export const LabExperimentReviewSchema = Type.Object({
  review: Type.Union([Type.Literal("needs_review"), Type.Literal("a"), Type.Literal("b"), Type.Literal("tie")]),
}, { additionalProperties: false });
export const LabExperimentResponseSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  experiment: LabExperimentSchema,
}, { additionalProperties: false });
export const LabExperimentCatalogSchema = Type.Object({
  contract_version: Type.Literal(CONTRACT_VERSION),
  enabled: Type.Boolean(),
  backend_revision: NullableText,
  provider: Type.Literal("zhipu-chat-completions"),
  prompt_version: Type.String(),
  models: Type.Array(Type.String()),
  cases: Type.Array(Type.Object({
    id: Type.String(), title: Type.String(), input: Type.String(), expected: Type.String(),
  }, { additionalProperties: false })),
  experiments: Type.Array(LabExperimentSchema),
}, { additionalProperties: false });
export type LabModelResult = Static<typeof LabModelResultSchema>;
export type LabExperiment = Static<typeof LabExperimentSchema>;
export type LabExperimentRequest = Static<typeof LabExperimentRequestSchema>;
