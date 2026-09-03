import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const Hash = Type.String({ pattern: "^[0-9a-f]{64}$" });
const TraceId = Type.String({ pattern: "^[0-9a-f]{32}$" });
const IdempotencyKey = Type.String({ minLength: 1, maxLength: 200 });

export const LabVersionEnvelopeSchema = Type.Object(
  {
    web_build: Type.String({ minLength: 1, maxLength: 80 }),
    ios_build: Type.String({ minLength: 1, maxLength: 80 }),
    backend_revision: Type.String({ minLength: 1, maxLength: 80 }),
    agent_version: Type.String({ minLength: 1, maxLength: 80 }),
    prompt_version: Type.String({ minLength: 1, maxLength: 80 }),
    policy_version: Type.String({ minLength: 1, maxLength: 80 }),
    fixture_version: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { additionalProperties: false },
);

export const LabEvidenceItemSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    label: Type.String({ minLength: 1, maxLength: 200 }),
    excerpt: Type.String({ minLength: 1, maxLength: 1_000 }),
    observed_at: Timestamp,
    status: Type.Union([
      Type.Literal("observation"),
      Type.Literal("confirmed"),
      Type.Literal("conflict"),
      Type.Literal("unavailable"),
    ]),
    source_label: Type.String({ minLength: 1, maxLength: 160 }),
  },
  { additionalProperties: false },
);

export const LabEvidenceSummarySchema = Type.Object(
  {
    confirmed: Type.Integer({ minimum: 0 }),
    observations: Type.Integer({ minimum: 0 }),
    conflicts: Type.Integer({ minimum: 0 }),
    unavailable: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const LabScenarioOutputSchema = Type.Object(
  {
    insight_id: Type.String({ minLength: 1, maxLength: 120 }),
    insight_kind: Type.Union([
      Type.Literal("relationship_change"),
      Type.Literal("identity_review"),
      Type.Literal("evidence_conflict"),
      Type.Literal("source_authority"),
      Type.Literal("action_review"),
    ]),
    headline: Type.String({ minLength: 1, maxLength: 240 }),
    observation: Type.String({ minLength: 1, maxLength: 1_000 }),
    interpretation: Type.String({ minLength: 1, maxLength: 1_000 }),
    uncertainty: Type.Union([
      Type.String({ minLength: 1, maxLength: 1_000 }),
      Type.Null(),
    ]),
    lifecycle: Type.Union([
      Type.Literal("hypothesis"),
      Type.Literal("abstained"),
      Type.Literal("blocked"),
      Type.Literal("unavailable"),
      Type.Literal("needs_review"),
    ]),
    evidence_summary: LabEvidenceSummarySchema,
    evidence: Type.Array(LabEvidenceItemSchema, { minItems: 1, maxItems: 12 }),
    required_question: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    requires_human_confirmation: Type.Boolean(),
    confirmation_count: Type.Integer({ minimum: 0, maximum: 10 }),
    canonical_mutation_count: Type.Literal(0),
    external_effect_count: Type.Literal(0),
  },
  { additionalProperties: false },
);

export const LabScenarioSummarySchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
    revision: Type.String({ minLength: 1, maxLength: 40 }),
    title: Type.String({ minLength: 1, maxLength: 160 }),
    summary: Type.String({ minLength: 1, maxLength: 500 }),
    category: Type.Union([
      Type.Literal("momentum"),
      Type.Literal("identity"),
      Type.Literal("evidence"),
      Type.Literal("authorization"),
      Type.Literal("action"),
    ]),
    risk_tier: Type.Union([
      Type.Literal("p0_blocker"),
      Type.Literal("p1_core"),
    ]),
    expected_behavior: Type.String({ minLength: 1, maxLength: 500 }),
    snapshot_hash: Hash,
    demo_identity: Type.String({ minLength: 1, maxLength: 120 }),
    baseline: LabVersionEnvelopeSchema,
    candidate: LabVersionEnvelopeSchema,
  },
  { additionalProperties: false },
);

export const LabSessionSchema = Type.Object(
  {
    id: Id,
    scenario: LabScenarioSummarySchema,
    environment: Type.Literal("FAT"),
    workspace_ref: Type.String({ pattern: "^lab_[a-f0-9]{12}$" }),
    tester_identity: Type.String({ minLength: 1, maxLength: 160 }),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("expired"),
      Type.Literal("closed"),
    ]),
    canonical_isolation: Type.Literal(true),
    production_data_access: Type.Literal(false),
    write_boundary: Type.Literal("lab_only"),
    active_envelope: LabVersionEnvelopeSchema,
    started_at: Timestamp,
    expires_at: Timestamp,
  },
  { additionalProperties: false },
);

export const LabRunSchema = Type.Object(
  {
    id: Id,
    session_id: Id,
    scenario_id: Type.String(),
    scenario_revision: Type.String(),
    variant: Type.Union([
      Type.Literal("baseline"),
      Type.Literal("candidate"),
    ]),
    snapshot_hash: Hash,
    output_hash: Hash,
    envelope: LabVersionEnvelopeSchema,
    output: LabScenarioOutputSchema,
    trace_id: TraceId,
    deterministic: Type.Literal(true),
    canonical_revision_before: Type.Integer({ minimum: 0 }),
    canonical_revision_after: Type.Integer({ minimum: 0 }),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const LabComparisonDifferenceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("insight"),
      Type.Literal("explanation"),
      Type.Literal("caution"),
      Type.Literal("question"),
      Type.Literal("confirmation_effort"),
    ]),
    label: Type.String({ minLength: 1, maxLength: 160 }),
    baseline: Type.String({ maxLength: 1_000 }),
    candidate: Type.String({ maxLength: 1_000 }),
    impact: Type.Union([
      Type.Literal("improved"),
      Type.Literal("regressed"),
      Type.Literal("changed"),
      Type.Literal("unchanged"),
    ]),
  },
  { additionalProperties: false },
);

export const LabComparisonSchema = Type.Object(
  {
    id: Id,
    session_id: Id,
    baseline_run: LabRunSchema,
    candidate_run: LabRunSchema,
    identical_snapshot: Type.Literal(true),
    differences: Type.Array(LabComparisonDifferenceSchema, { maxItems: 12 }),
    improved_count: Type.Integer({ minimum: 0 }),
    regressed_count: Type.Integer({ minimum: 0 }),
    changed_count: Type.Integer({ minimum: 0 }),
    canonical_mutation_count: Type.Literal(0),
    external_effect_count: Type.Literal(0),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const RealityReceiptSchema = Type.Object(
  {
    id: Id,
    display_ref: Type.String({ pattern: "^RR-[A-F0-9]{8}$" }),
    session_id: Id,
    run_id: Id,
    scenario_id: Type.String(),
    scenario_revision: Type.String(),
    expected: Type.String({ minLength: 1, maxLength: 1_000 }),
    actual: Type.String({ minLength: 1, maxLength: 1_000 }),
    issue_summary: Type.String({ minLength: 1, maxLength: 1_000 }),
    snapshot_hash: Hash,
    output_hash: Hash,
    envelope: LabVersionEnvelopeSchema,
    trace_id: TraceId,
    canonical_revision: Type.Integer({ minimum: 0 }),
    reproduced: Type.Boolean(),
    screenshot_state: Type.Literal("redacted_surface_snapshot"),
    redaction_applied: Type.Literal(true),
    status: Type.Union([
      Type.Literal("recorded"),
      Type.Literal("promoted"),
    ]),
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const LabEvalCaseSchema = Type.Object(
  {
    id: Id,
    case_ref: Type.String({ pattern: "^LAB-[A-F0-9]{8}$" }),
    version: Type.Integer({ minimum: 1 }),
    source_receipt_id: Id,
    scenario_id: Type.String(),
    scenario_revision: Type.String(),
    snapshot_hash: Hash,
    expected_behavior: Type.String({ minLength: 1, maxLength: 1_000 }),
    observed_regression: Type.String({ minLength: 1, maxLength: 1_000 }),
    partition: Type.Literal("dev"),
    lifecycle: Type.Literal("active"),
    adjudication: Type.Literal("human_gold"),
    release_gate: Type.Literal("candidate_blocking"),
    reviewer_note: Type.String({ minLength: 10, maxLength: 1_000 }),
    promoted_by_user_id: Id,
    created_at: Timestamp,
  },
  { additionalProperties: false },
);

export const LabCapabilitySchema = Type.Object(
  {
    enabled: Type.Boolean(),
    reason: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    internal_build_required: Type.Literal(true),
    synthetic_evidence_only: Type.Literal(true),
    production_data_access: Type.Literal(false),
    canonical_write_access: Type.Literal(false),
    external_effect_access: Type.Literal(false),
  },
  { additionalProperties: false },
);

export const LabManifestResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    capability: LabCapabilitySchema,
    environment: Type.Literal("FAT"),
    scenarios: Type.Array(LabScenarioSummarySchema, { maxItems: 12 }),
    active_session: Type.Union([LabSessionSchema, Type.Null()]),
    latest_run: Type.Union([LabRunSchema, Type.Null()]),
    eval_cases: Type.Array(LabEvalCaseSchema, { maxItems: 50 }),
  },
  { additionalProperties: false },
);

export const StartLabSessionRequestSchema = Type.Object(
  {
    scenario_id: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
    idempotency_key: IdempotencyKey,
  },
  { additionalProperties: false },
);

export const RunLabScenarioRequestSchema = Type.Object(
  {
    variant: Type.Union([
      Type.Literal("baseline"),
      Type.Literal("candidate"),
    ]),
    idempotency_key: IdempotencyKey,
  },
  { additionalProperties: false },
);

export const CompareLabScenarioRequestSchema = Type.Object(
  { idempotency_key: IdempotencyKey },
  { additionalProperties: false },
);

export const CreateRealityReceiptRequestSchema = Type.Object(
  {
    run_id: Id,
    idempotency_key: IdempotencyKey,
  },
  { additionalProperties: false },
);

export const PromoteRealityReceiptRequestSchema = Type.Object(
  {
    decision: Type.Literal("promote"),
    idempotency_key: IdempotencyKey,
  },
  { additionalProperties: false },
);

export const LabSessionResponseSchema = Type.Object(
  { contract_version: Type.Literal(CONTRACT_VERSION), session: LabSessionSchema },
  { additionalProperties: false },
);

export const LabRunResponseSchema = Type.Object(
  { contract_version: Type.Literal(CONTRACT_VERSION), run: LabRunSchema },
  { additionalProperties: false },
);

export const LabComparisonResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    comparison: LabComparisonSchema,
  },
  { additionalProperties: false },
);

export const RealityReceiptResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    receipt: RealityReceiptSchema,
  },
  { additionalProperties: false },
);

export const LabEvalCaseResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    eval_case: LabEvalCaseSchema,
  },
  { additionalProperties: false },
);

export type LabVersionEnvelope = Static<typeof LabVersionEnvelopeSchema>;
export type LabScenarioOutput = Static<typeof LabScenarioOutputSchema>;
export type LabScenarioSummary = Static<typeof LabScenarioSummarySchema>;
export type LabSession = Static<typeof LabSessionSchema>;
export type LabRun = Static<typeof LabRunSchema>;
export type LabComparison = Static<typeof LabComparisonSchema>;
export type RealityReceipt = Static<typeof RealityReceiptSchema>;
export type LabEvalCase = Static<typeof LabEvalCaseSchema>;
export type LabManifestResponse = Static<typeof LabManifestResponseSchema>;
export type StartLabSessionRequest = Static<typeof StartLabSessionRequestSchema>;
export type RunLabScenarioRequest = Static<typeof RunLabScenarioRequestSchema>;
export type CompareLabScenarioRequest = Static<typeof CompareLabScenarioRequestSchema>;
export type CreateRealityReceiptRequest = Static<typeof CreateRealityReceiptRequestSchema>;
export type PromoteRealityReceiptRequest = Static<typeof PromoteRealityReceiptRequestSchema>;
export type LabSessionResponse = Static<typeof LabSessionResponseSchema>;
export type LabRunResponse = Static<typeof LabRunResponseSchema>;
export type LabComparisonResponse = Static<typeof LabComparisonResponseSchema>;
export type RealityReceiptResponse = Static<typeof RealityReceiptResponseSchema>;
export type LabEvalCaseResponse = Static<typeof LabEvalCaseResponseSchema>;
