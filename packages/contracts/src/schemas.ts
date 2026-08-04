import { Type, type Static } from "@sinclair/typebox";

import {
  ASSERTION_FIELDS,
  CONTRACT_VERSION,
  DISPOSITIONS,
  SIMULATED_ADAPTER,
  SIMULATED_CAPABILITY,
} from "./constants.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const IdempotencyKey = Type.String({ minLength: 1, maxLength: 128 });
const NullableString = Type.Union([
  Type.String({ minLength: 1, maxLength: 500 }),
  Type.Null(),
]);

export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.String(),
      message: Type.String(),
      request_id: Type.String(),
      details: Type.Optional(Type.Unknown()),
    }),
  },
  { $id: "ErrorResponse", additionalProperties: false },
);

export const SimulatedLoginRequestSchema = Type.Object(
  {
    account_slug: Type.String({ minLength: 1, maxLength: 80 }),
    user_email: Type.String({ format: "email", maxLength: 320 }),
    client_label: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { $id: "SimulatedLoginRequest", additionalProperties: false },
);

export const SessionResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    access_token: Type.String({ minLength: 32 }),
    expires_at: Timestamp,
    account: Type.Object({
      id: Id,
      slug: Type.String(),
      name: Type.String(),
    }),
    user: Type.Object({
      id: Id,
      email: Type.String(),
      display_name: Type.String(),
      kind: Type.Literal("simulated_human"),
    }),
  },
  { $id: "SessionResponse", additionalProperties: false },
);

export const CaptureSourceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("fixture"),
      Type.Literal("transcript"),
      Type.Literal("screenshot_metadata"),
    ]),
    captured_at: Timestamp,
    source_timezone: NullableString,
    purpose: Type.String({ minLength: 1, maxLength: 240 }),
    retention_until: Type.Optional(Type.Union([Timestamp, Type.Null()])),
    source_locator: Type.Optional(
      Type.String({ minLength: 1, maxLength: 500 }),
    ),
  },
  { additionalProperties: false },
);

const BoundIdentitySchema = Type.Object(
  {
    status: Type.Literal("bound"),
    external_ref: Type.String({ minLength: 1, maxLength: 200 }),
    display_label: Type.String({ minLength: 1, maxLength: 200 }),
    assignment_ref: Type.String({ minLength: 1, maxLength: 200 }),
    assignment_label: Type.String({ minLength: 1, maxLength: 200 }),
    binding_basis: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);

const AmbiguousIdentitySchema = Type.Object(
  {
    status: Type.Literal("ambiguous"),
    options: Type.Array(
      Type.Object(
        {
          external_ref: Type.String({ minLength: 1, maxLength: 200 }),
          display_label: Type.String({ minLength: 1, maxLength: 200 }),
          assignment_label: Type.String({ minLength: 1, maxLength: 200 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 2, maxItems: 20 },
    ),
    reason: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);

const UnboundIdentitySchema = Type.Object(
  {
    status: Type.Literal("unbound"),
    reason: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);

export const CaptureIdentitySchema = Type.Union([
  BoundIdentitySchema,
  AmbiguousIdentitySchema,
  UnboundIdentitySchema,
]);

export const EvidenceMessageInputSchema = Type.Object(
  {
    source_message_id: Type.String({ minLength: 1, maxLength: 128 }),
    sequence: Type.Integer({ minimum: 0 }),
    speaker: Type.Union([
      Type.Literal("candidate"),
      Type.Literal("recruiter"),
      Type.Literal("hiring_manager"),
      Type.Literal("unknown"),
    ]),
    text: Type.String({ minLength: 1, maxLength: 20000 }),
  },
  { additionalProperties: false },
);

export const CreateCaptureRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    fixture_case_id: Type.Optional(
      Type.String({ minLength: 1, maxLength: 80 }),
    ),
    source: CaptureSourceSchema,
    identity: CaptureIdentitySchema,
    messages: Type.Array(EvidenceMessageInputSchema, {
      minItems: 1,
      maxItems: 500,
    }),
  },
  { $id: "CreateCaptureRequest", additionalProperties: false },
);

export const EvidenceMessageSchema = Type.Object(
  {
    id: Id,
    source_message_id: Type.String(),
    sequence: Type.Integer(),
    speaker: Type.String(),
    text: Type.Union([Type.String(), Type.Null()]),
    content_hash: Type.String(),
    status: Type.Union([Type.Literal("active"), Type.Literal("deleted")]),
  },
  { additionalProperties: false },
);

export const CaptureResponseSchema = Type.Object(
  {
    id: Id,
    account_id: Id,
    fixture_case_id: Type.Union([Type.String(), Type.Null()]),
    status: Type.Union([Type.Literal("active"), Type.Literal("deleted")]),
    version: Type.Integer({ minimum: 1 }),
    identity_status: Type.Union([
      Type.Literal("bound"),
      Type.Literal("ambiguous"),
      Type.Literal("unbound"),
    ]),
    subject_id: Type.Union([Id, Type.Null()]),
    assignment_id: Type.Union([Id, Type.Null()]),
    source: CaptureSourceSchema,
    messages: Type.Array(EvidenceMessageSchema),
    created_at: Timestamp,
  },
  { $id: "CaptureResponse", additionalProperties: false },
);

export const ProposedAssertionInputSchema = Type.Object(
  {
    field: Type.Union(ASSERTION_FIELDS.map((field) => Type.Literal(field))),
    status: Type.Union([
      Type.Literal("proposed"),
      Type.Literal("ambiguous"),
      Type.Literal("superseded"),
    ]),
    value: Type.String({ minLength: 1, maxLength: 2000 }),
    evidence_message_id: Type.String({ minLength: 1, maxLength: 128 }),
    evidence_quote: Type.String({ minLength: 1, maxLength: 2000 }),
    subject_kind: Type.Union([
      Type.Literal("candidate"),
      Type.Literal("hiring_manager"),
      Type.Literal("unknown"),
    ]),
    temporal_relation: Type.Union([
      Type.Literal("new"),
      Type.Literal("reinforces"),
      Type.Literal("supersedes"),
    ]),
    supersedes_state_id: Type.Optional(Id),
  },
  { additionalProperties: false },
);

export const SimulatedEffectPreviewSchema = Type.Object(
  {
    simulated: Type.Literal(true),
    capability: Type.Literal(SIMULATED_CAPABILITY),
    adapter: Type.Literal(SIMULATED_ADAPTER),
    target: Type.Object(
      {
        destination_key: Type.String({ minLength: 1, maxLength: 200 }),
        label: Type.String({ minLength: 1, maxLength: 200 }),
      },
      { additionalProperties: false },
    ),
    change: Type.Object(
      {
        kind: Type.Literal("create_attention"),
        title: Type.String({ minLength: 1, maxLength: 240 }),
      },
      { additionalProperties: false },
    ),
    expected_destination_version: Type.Integer({ minimum: 0 }),
    simulation_behavior: Type.Union([
      Type.Literal("success"),
      Type.Literal("failure"),
      Type.Literal("timeout_before_write"),
      Type.Literal("timeout_after_write"),
    ]),
  },
  { $id: "SimulatedEffectPreview", additionalProperties: false },
);

export const ActionProposalInputSchema = Type.Object(
  {
    type: Type.Literal("prepare_question"),
    owner: Type.Literal("recruiter"),
    target: Type.String({ minLength: 1, maxLength: 500 }),
    reason: Type.String({ minLength: 1, maxLength: 1000 }),
    due: Type.String({ minLength: 1, maxLength: 240 }),
    evidence_message_ids: Type.Array(
      Type.String({ minLength: 1, maxLength: 128 }),
      { minItems: 1, uniqueItems: true },
    ),
    effect_preview: SimulatedEffectPreviewSchema,
  },
  { additionalProperties: false },
);

export const SubmitAnalysisProposalRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    producer: Type.Object(
      {
        kind: Type.Union([
          Type.Literal("model"),
          Type.Literal("fixture_compiler"),
          Type.Literal("human_draft"),
        ]),
        name: Type.String({ minLength: 1, maxLength: 120 }),
        version: Type.String({ minLength: 1, maxLength: 120 }),
      },
      { additionalProperties: false },
    ),
    disposition: Type.Union(
      DISPOSITIONS.map((disposition) => Type.Literal(disposition)),
    ),
    assertions: Type.Array(ProposedAssertionInputSchema, { maxItems: 50 }),
    action: Type.Union([ActionProposalInputSchema, Type.Null()]),
  },
  { $id: "SubmitAnalysisProposalRequest", additionalProperties: false },
);

export const AssertionProposalSchema = Type.Object(
  {
    id: Id,
    field: Type.String(),
    status: Type.String(),
    review_status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("confirmed"),
      Type.Literal("dismissed"),
      Type.Literal("unresolved"),
      Type.Literal("deleted"),
    ]),
    value: Type.Union([Type.String(), Type.Null()]),
    evidence_id: Id,
    evidence_quote: Type.Union([Type.String(), Type.Null()]),
    subject_kind: Type.String(),
    temporal_relation: Type.String(),
    supersedes_state_id: Type.Union([Id, Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const ActionProposalSchema = Type.Object(
  {
    id: Id,
    type: Type.Literal("prepare_question"),
    status: Type.String(),
    version: Type.Integer({ minimum: 1 }),
    target: Type.String(),
    reason: Type.String(),
    due: Type.String(),
    evidence_ids: Type.Array(Id),
    required_assertion_ids: Type.Array(Id),
    exact_preview: SimulatedEffectPreviewSchema,
    exact_preview_digest: Type.String(),
    simulated: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const AnalysisProposalResponseSchema = Type.Object(
  {
    id: Id,
    capture_id: Id,
    disposition: Type.Union(
      DISPOSITIONS.map((disposition) => Type.Literal(disposition)),
    ),
    producer: Type.Object({
      kind: Type.String(),
      name: Type.String(),
      version: Type.String(),
    }),
    assertions: Type.Array(AssertionProposalSchema),
    action: Type.Union([ActionProposalSchema, Type.Null()]),
    created_at: Timestamp,
  },
  { $id: "AnalysisProposalResponse", additionalProperties: false },
);

export const AssertionDecisionRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    expected_assertion_version: Type.Integer({ minimum: 1 }),
    decision: Type.Union([
      Type.Literal("confirm"),
      Type.Literal("dismiss"),
      Type.Literal("leave_unresolved"),
    ]),
    corrected_value: Type.Optional(
      Type.String({ minLength: 1, maxLength: 2000 }),
    ),
  },
  { $id: "AssertionDecisionRequest", additionalProperties: false },
);

export const AssertionDecisionResponseSchema = Type.Object(
  {
    decision_id: Id,
    assertion_id: Id,
    decision: Type.String(),
    decided_by_user_id: Id,
    confirmed_state_id: Type.Union([Id, Type.Null()]),
    decided_at: Timestamp,
  },
  { $id: "AssertionDecisionResponse", additionalProperties: false },
);

export const ReviseActionRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    expected_action_version: Type.Integer({ minimum: 1 }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    exact_preview: SimulatedEffectPreviewSchema,
  },
  { $id: "ReviseActionRequest", additionalProperties: false },
);

export const ApproveActionRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    expected_action_version: Type.Integer({ minimum: 1 }),
    exact_preview: SimulatedEffectPreviewSchema,
    expires_at: Type.Optional(Timestamp),
  },
  { $id: "ApproveActionRequest", additionalProperties: false },
);

export const ApprovalResponseSchema = Type.Object(
  {
    id: Id,
    action_id: Id,
    action_version: Type.Integer({ minimum: 1 }),
    exact_preview_digest: Type.String(),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("revoked"),
      Type.Literal("stale"),
      Type.Literal("consumed"),
    ]),
    approved_by_user_id: Id,
    granted_at: Timestamp,
    expires_at: Timestamp,
  },
  { $id: "ApprovalResponse", additionalProperties: false },
);

export const RevokeApprovalRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: "RevokeApprovalRequest", additionalProperties: false },
);

export const ExecuteActionRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    approval_id: Id,
    expected_action_version: Type.Integer({ minimum: 1 }),
  },
  { $id: "ExecuteActionRequest", additionalProperties: false },
);

export const ReconcileEffectRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
  },
  { $id: "ReconcileEffectRequest", additionalProperties: false },
);

export const EffectResultResponseSchema = Type.Object(
  {
    attempt_id: Id,
    action_id: Id,
    attempt_status: Type.Union([
      Type.Literal("verified"),
      Type.Literal("failed"),
      Type.Literal("unknown"),
    ]),
    action_status: Type.String(),
    simulated: Type.Literal(true),
    reused: Type.Boolean(),
    observation: Type.Union([
      Type.Object({
        id: Id,
        destination_key: Type.String(),
        destination_version: Type.Integer(),
        match_status: Type.Union([
          Type.Literal("matched"),
          Type.Literal("mismatched"),
          Type.Literal("unavailable"),
        ]),
        observed_at: Timestamp,
      }),
      Type.Null(),
    ]),
    outcome: Type.Union([
      Type.Object({
        id: Id,
        status: Type.Union([
          Type.Literal("verified"),
          Type.Literal("failed"),
          Type.Literal("unknown"),
        ]),
        summary: Type.String(),
        created_at: Timestamp,
      }),
      Type.Null(),
    ]),
  },
  { $id: "EffectResultResponse", additionalProperties: false },
);

export const SyncResponseSchema = Type.Object(
  {
    after: Type.Integer({ minimum: 0 }),
    next_cursor: Type.Integer({ minimum: 0 }),
    events: Type.Array(
      Type.Object({
        sequence: Type.Integer({ minimum: 1 }),
        event_type: Type.String(),
        entity_type: Type.String(),
        entity_id: Id,
        occurred_at: Timestamp,
        metadata: Type.Record(Type.String(), Type.Unknown()),
      }),
    ),
  },
  { $id: "SyncResponse", additionalProperties: false },
);

export const DeleteCaptureRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: "DeleteCaptureRequest", additionalProperties: false },
);

export const DeleteCaptureResponseSchema = Type.Object(
  {
    deletion_id: Id,
    capture_id: Id,
    status: Type.Literal("deleted"),
    derivatives_deleted: Type.Integer({ minimum: 0 }),
    access_revoked_at: Timestamp,
  },
  { $id: "DeleteCaptureResponse", additionalProperties: false },
);

export const TemporalStateResponseSchema = Type.Object(
  {
    assignment_id: Id,
    states: Type.Array(
      Type.Object({
        id: Id,
        subject_id: Id,
        assignment_id: Id,
        field: Type.String(),
        value: Type.Union([Type.String(), Type.Null()]),
        status: Type.Union([
          Type.Literal("active"),
          Type.Literal("superseded"),
          Type.Literal("contested"),
          Type.Literal("expired"),
          Type.Literal("deleted"),
        ]),
        source_assertion_id: Id,
        confirmed_by_decision_id: Id,
        supersedes_state_id: Type.Union([Id, Type.Null()]),
        valid_from: Timestamp,
        valid_until: Type.Union([Timestamp, Type.Null()]),
      }),
    ),
  },
  { $id: "TemporalStateResponse", additionalProperties: false },
);

export const WorkspaceReviewResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    data_classification: Type.Literal("synthetic_fixture_only"),
    account_id: Id,
    account_slug: Type.String(),
    subject: Type.Object(
      {
        id: Id,
        display_label: Type.String(),
      },
      { additionalProperties: false },
    ),
    assignment: Type.Object(
      {
        id: Id,
        display_label: Type.String(),
      },
      { additionalProperties: false },
    ),
    capture: CaptureResponseSchema,
    analysis: AnalysisProposalResponseSchema,
    confirmed_state: Type.Object(
      {
        id: Id,
        version: Type.Integer({ minimum: 0 }),
        assertions: Type.Array(
          Type.Object(
            {
              id: Id,
              field: Type.String(),
              value: Type.String(),
              status: Type.Literal("confirmed"),
              state_status: Type.Union([
                Type.Literal("active"),
                Type.Literal("superseded"),
                Type.Literal("contested"),
                Type.Literal("expired"),
              ]),
              evidence_message_id: Type.String(),
              evidence_id: Id,
              evidence_quote: Type.Union([Type.String(), Type.Null()]),
              source_assertion_id: Id,
              confirmed_by_decision_id: Id,
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    latest_approval: Type.Union([ApprovalResponseSchema, Type.Null()]),
    latest_effect: Type.Union([EffectResultResponseSchema, Type.Null()]),
    audit_cursor: Type.Integer({ minimum: 0 }),
  },
  { $id: "WorkspaceReviewResponse", additionalProperties: false },
);

export const DeletionLineageResponseSchema = Type.Object(
  {
    deletion_id: Id,
    capture_id: Id,
    access_revoked_at: Timestamp,
    completed_at: Type.Union([Timestamp, Type.Null()]),
    lineage: Type.Array(
      Type.Object({
        entity_type: Type.String(),
        entity_id: Id,
        disposition: Type.Union([
          Type.Literal("content_removed"),
          Type.Literal("access_revoked"),
          Type.Literal("audit_reference_retained"),
        ]),
        deleted_at: Timestamp,
      }),
    ),
  },
  { $id: "DeletionLineageResponse", additionalProperties: false },
);

export const RevokeCapabilityRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    capability: Type.Literal(SIMULATED_CAPABILITY),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: "RevokeCapabilityRequest", additionalProperties: false },
);

export type SimulatedLoginRequest = Static<
  typeof SimulatedLoginRequestSchema
>;
export type SessionResponse = Static<typeof SessionResponseSchema>;
export type CreateCaptureRequest = Static<typeof CreateCaptureRequestSchema>;
export type CaptureResponse = Static<typeof CaptureResponseSchema>;
export type SubmitAnalysisProposalRequest = Static<
  typeof SubmitAnalysisProposalRequestSchema
>;
export type AnalysisProposalResponse = Static<
  typeof AnalysisProposalResponseSchema
>;
export type AssertionDecisionRequest = Static<
  typeof AssertionDecisionRequestSchema
>;
export type AssertionDecisionResponse = Static<
  typeof AssertionDecisionResponseSchema
>;
export type ActionProposal = Static<typeof ActionProposalSchema>;
export type SimulatedEffectPreview = Static<
  typeof SimulatedEffectPreviewSchema
>;
export type ReviseActionRequest = Static<typeof ReviseActionRequestSchema>;
export type ApproveActionRequest = Static<typeof ApproveActionRequestSchema>;
export type ApprovalResponse = Static<typeof ApprovalResponseSchema>;
export type RevokeApprovalRequest = Static<
  typeof RevokeApprovalRequestSchema
>;
export type ExecuteActionRequest = Static<typeof ExecuteActionRequestSchema>;
export type ReconcileEffectRequest = Static<
  typeof ReconcileEffectRequestSchema
>;
export type EffectResultResponse = Static<typeof EffectResultResponseSchema>;
export type SyncResponse = Static<typeof SyncResponseSchema>;
export type DeleteCaptureRequest = Static<typeof DeleteCaptureRequestSchema>;
export type DeleteCaptureResponse = Static<typeof DeleteCaptureResponseSchema>;
export type TemporalStateResponse = Static<typeof TemporalStateResponseSchema>;
export type WorkspaceReviewResponse = Static<
  typeof WorkspaceReviewResponseSchema
>;
export type DeletionLineageResponse = Static<
  typeof DeletionLineageResponseSchema
>;
export type RevokeCapabilityRequest = Static<
  typeof RevokeCapabilityRequestSchema
>;
