import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const TraceId = Type.String({ pattern: "^[0-9a-f]{32}$" });
const SpanId = Type.String({ pattern: "^[0-9a-f]{16}$" });
const Hash = Type.String({ pattern: "^[0-9a-f]{64}$" });
const SafeAttributeValue = Type.Union([
  Type.String({ maxLength: 1_000 }),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);

export const TelemetrySafeAttributesSchema = Type.Record(
  Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-zA-Z0-9_.-]+$" }),
  SafeAttributeValue,
  { maxProperties: 80 },
);

export const TelemetryContentPartSchema = Type.Object(
  {
    id: Id,
    ordinal: Type.Integer({ minimum: 0, maximum: 49 }),
    kind: Type.Union([
      Type.Literal("text"),
      Type.Literal("image"),
      Type.Literal("document"),
      Type.Literal("audio"),
      Type.Literal("json"),
      Type.Literal("other"),
    ]),
    mime_type: Type.String({ minLength: 1, maxLength: 160 }),
    byte_size: Type.Integer({ minimum: 0, maximum: 5_242_880 }),
    content_hash: Hash,
    capture_status: Type.Union([
      Type.Literal("reference_only"),
      Type.Literal("governed_full"),
      Type.Literal("minimized_derivative"),
      Type.Literal("redacted"),
    ]),
    purpose: Type.String({ minLength: 1, maxLength: 160 }),
    authorization_scope: Type.String({ minLength: 1, maxLength: 500 }),
    retention_days: Type.Integer({ minimum: 1, maximum: 365 }),
    content_text: Type.Optional(Type.String({ maxLength: 100_000 })),
    content_base64: Type.Optional(Type.String({ maxLength: 7_000_000 })),
    governed_source_ref: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);

export const CreateTelemetryTraceRequestSchema = Type.Object(
  {
    trace_id: TraceId,
    root_span_id: SpanId,
    interaction_id: Id,
    browser_session_id: Id,
    name: Type.String({ minLength: 1, maxLength: 160 }),
    surface: Type.Union([
      Type.Literal("web"),
      Type.Literal("ios"),
      Type.Literal("browser_extension"),
      Type.Literal("backend"),
      Type.Literal("evaluation"),
    ]),
    route: Type.String({ minLength: 1, maxLength: 500 }),
    started_at: Timestamp,
    data_classification: Type.Union([
      Type.Literal("synthetic"),
      Type.Literal("private_relationship"),
      Type.Literal("operational"),
    ]),
    attributes: TelemetrySafeAttributesSchema,
    content_parts: Type.Array(TelemetryContentPartSchema, {
      maxItems: 50,
    }),
  },
  { $id: "CreateTelemetryTraceRequest", additionalProperties: false },
);

export const AppendTelemetrySpanRequestSchema = Type.Object(
  {
    span_id: SpanId,
    parent_span_id: Type.Union([SpanId, Type.Null()]),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    kind: Type.Union([
      Type.Literal("internal"),
      Type.Literal("client"),
      Type.Literal("server"),
      Type.Literal("producer"),
      Type.Literal("consumer"),
    ]),
    status: Type.Union([
      Type.Literal("unset"),
      Type.Literal("ok"),
      Type.Literal("error"),
    ]),
    started_at: Timestamp,
    ended_at: Type.Union([Timestamp, Type.Null()]),
    attributes: TelemetrySafeAttributesSchema,
    artifact_refs: Type.Array(Id, { maxItems: 50, uniqueItems: true }),
    agent_run_id: Type.Union([Id, Type.Null()]),
    agent_event_sequence: Type.Union([
      Type.Integer({ minimum: 1 }),
      Type.Null(),
    ]),
  },
  { $id: "AppendTelemetrySpanRequest", additionalProperties: false },
);

export const AppendTelemetryEventRequestSchema = Type.Object(
  {
    event_id: Id,
    span_id: Type.Union([SpanId, Type.Null()]),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    occurred_at: Timestamp,
    attributes: TelemetrySafeAttributesSchema,
    artifact_refs: Type.Array(Id, { maxItems: 50, uniqueItems: true }),
  },
  { $id: "AppendTelemetryEventRequest", additionalProperties: false },
);

export const AppendTelemetryBatchRequestSchema = Type.Object(
  {
    spans: Type.Array(AppendTelemetrySpanRequestSchema, { maxItems: 100 }),
    events: Type.Array(AppendTelemetryEventRequestSchema, { maxItems: 200 }),
  },
  { $id: "AppendTelemetryBatchRequest", additionalProperties: false },
);

export const CompleteTelemetryTraceRequestSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("ok"),
      Type.Literal("error"),
      Type.Literal("cancelled"),
    ]),
    ended_at: Timestamp,
    error_code: Type.Union([
      Type.String({ minLength: 1, maxLength: 160 }),
      Type.Null(),
    ]),
    attributes: TelemetrySafeAttributesSchema,
  },
  { $id: "CompleteTelemetryTraceRequest", additionalProperties: false },
);

export const TelemetryContextSchema = Type.Object(
  {
    trace_id: TraceId,
    parent_span_id: SpanId,
    interaction_id: Id,
  },
  { additionalProperties: false },
);

export const TelemetryArtifactSchema = Type.Object(
  {
    id: Id,
    ordinal: Type.Integer({ minimum: 0 }),
    kind: Type.String(),
    mime_type: Type.String(),
    byte_size: Type.Integer({ minimum: 0 }),
    content_hash: Hash,
    capture_status: Type.String(),
    purpose: Type.String(),
    authorization_scope: Type.String(),
    governed_source_ref: Type.Union([Type.String(), Type.Null()]),
    retention_expires_at: Timestamp,
    deletion_state: Type.String(),
    preview_text: Type.Union([Type.String(), Type.Null()]),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const TelemetrySpanSchema = Type.Object(
  {
    span_id: SpanId,
    parent_span_id: Type.Union([SpanId, Type.Null()]),
    name: Type.String(),
    kind: Type.String(),
    status: Type.String(),
    started_at: Timestamp,
    ended_at: Type.Union([Timestamp, Type.Null()]),
    duration_ms: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    attributes: TelemetrySafeAttributesSchema,
    artifact_refs: Type.Array(Id),
    agent_run_id: Type.Union([Id, Type.Null()]),
    agent_event_sequence: Type.Union([Type.Integer(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TelemetryEventSchema = Type.Object(
  {
    event_id: Id,
    span_id: Type.Union([SpanId, Type.Null()]),
    name: Type.String(),
    occurred_at: Timestamp,
    attributes: TelemetrySafeAttributesSchema,
    artifact_refs: Type.Array(Id),
  },
  { additionalProperties: false },
);

export const TelemetryEvaluationSchema = Type.Object(
  {
    id: Id,
    span_id: Type.Union([SpanId, Type.Null()]),
    evaluator_type: Type.Union([
      Type.Literal("deterministic"),
      Type.Literal("human"),
      Type.Literal("model"),
      Type.Literal("outcome"),
    ]),
    evaluator_name: Type.String(),
    evaluator_version: Type.String(),
    verdict: Type.Union([
      Type.Literal("pass"),
      Type.Literal("fail"),
      Type.Literal("abstain"),
      Type.Literal("needs_review"),
    ]),
    score: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
    explanation: Type.Union([Type.String(), Type.Null()]),
    evidence_refs: Type.Array(Id),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const TelemetryEvalCaseSummarySchema = Type.Object(
  {
    scenario: Type.String({ minLength: 1, maxLength: 120 }),
    provider: Type.String({ minLength: 1, maxLength: 160 }),
    modality: Type.Union([
      Type.Literal("text"),
      Type.Literal("image"),
      Type.Literal("multimodal"),
    ]),
    verdict: Type.Union([
      Type.Literal("pass"),
      Type.Literal("fail"),
      Type.Literal("needs_review"),
    ]),
    earned_points: Type.Integer({ minimum: 0, maximum: 100 }),
    possible_points: Type.Literal(100),
  },
  { additionalProperties: false },
);

export const TelemetryTraceSummarySchema = Type.Object(
  {
    trace_id: TraceId,
    interaction_id: Id,
    name: Type.String(),
    surface: Type.String(),
    route: Type.String(),
    status: Type.String(),
    data_classification: Type.String(),
    content_capture_status: Type.String(),
    span_count: Type.Integer({ minimum: 0 }),
    event_count: Type.Integer({ minimum: 0 }),
    artifact_count: Type.Integer({ minimum: 0 }),
    error_count: Type.Integer({ minimum: 0 }),
    started_at: Timestamp,
    ended_at: Type.Union([Timestamp, Type.Null()]),
    duration_ms: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    eval_case: Type.Union([TelemetryEvalCaseSummarySchema, Type.Null()]),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const TelemetryTraceListResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    traces: Type.Array(TelemetryTraceSummarySchema),
  },
  { $id: "TelemetryTraceListResponse", additionalProperties: false },
);

export const TelemetryTraceDetailResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    trace: Type.Intersect([
      TelemetryTraceSummarySchema,
      Type.Object(
        {
          root_span_id: SpanId,
          attributes: TelemetrySafeAttributesSchema,
          spans: Type.Array(TelemetrySpanSchema),
          events: Type.Array(TelemetryEventSchema),
          artifacts: Type.Array(TelemetryArtifactSchema),
          evaluations: Type.Array(TelemetryEvaluationSchema),
        },
        { additionalProperties: false },
      ),
    ]),
  },
  { $id: "TelemetryTraceDetailResponse", additionalProperties: false },
);

export const TelemetryMutationResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    trace_id: TraceId,
    interaction_id: Id,
    accepted_spans: Type.Integer({ minimum: 0 }),
    accepted_events: Type.Integer({ minimum: 0 }),
    artifact_ids: Type.Array(Id),
    status: Type.String(),
  },
  { $id: "TelemetryMutationResponse", additionalProperties: false },
);

export type CreateTelemetryTraceRequest = Static<
  typeof CreateTelemetryTraceRequestSchema
>;
export type AppendTelemetryBatchRequest = Static<
  typeof AppendTelemetryBatchRequestSchema
>;
export type CompleteTelemetryTraceRequest = Static<
  typeof CompleteTelemetryTraceRequestSchema
>;
export type TelemetryContext = Static<typeof TelemetryContextSchema>;
export type TelemetryTraceListResponse = Static<
  typeof TelemetryTraceListResponseSchema
>;
export type TelemetryTraceDetailResponse = Static<
  typeof TelemetryTraceDetailResponseSchema
>;
export type TelemetryMutationResponse = Static<
  typeof TelemetryMutationResponseSchema
>;
