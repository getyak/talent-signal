import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const CalendarDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const IdempotencyKey = Type.String({ minLength: 1, maxLength: 128 });

export const PursuitTypeSchema = Type.Union([
  Type.Literal("recruiting"),
  Type.Literal("sales"),
]);

export const PursuitStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("succeeded"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
]);

export const PursuitRoleStatusSchema = Type.Union([
  Type.Literal("active"),
  Type.Literal("quiet"),
  Type.Literal("removed"),
]);

export const PursuitRoleConfidenceSchema = Type.Union([
  Type.Literal("confirmed"),
  Type.Literal("suggested"),
]);

export const EvidenceBasisKindSchema = Type.Union([
  Type.Literal("evidence_supported"),
  Type.Literal("user_authored"),
]);

export const EvidenceAvailabilitySchema = Type.Union([
  Type.Literal("not_required"),
  Type.Literal("available"),
  Type.Literal("partial"),
  Type.Literal("unavailable"),
]);

export const EvidenceAuthoritySchema = Type.Object(
  {
    availability: EvidenceAvailabilitySchema,
    reference_count: Type.Integer({ minimum: 0 }),
    available_reference_count: Type.Integer({ minimum: 0 }),
    unavailable_reference_count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const PursuitActionStatusSchema = Type.Union([
  Type.Literal("drafted"),
  Type.Literal("awaiting_confirmation"),
  Type.Literal("scheduled"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
  Type.Literal("failed"),
]);

const SubjectReferenceSchema = Type.Union([
  Type.Object(
    { type: Type.Literal("person"), id: Id },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("organization"), id: Id },
    { additionalProperties: false },
  ),
]);

const CreatePursuitRoleSchema = Type.Object(
  {
    subject_ref: SubjectReferenceSchema,
    role_type: Type.String({ minLength: 1, maxLength: 80 }),
    status: Type.Optional(PursuitRoleStatusSchema),
    confidence: PursuitRoleConfidenceSchema,
    basis_kind: EvidenceBasisKindSchema,
    evidence_refs: Type.Array(Id, { maxItems: 50 }),
  },
  { additionalProperties: false },
);

const CreatePursuitCriterionSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 80 }),
    label: Type.String({ minLength: 1, maxLength: 200 }),
    requirement: Type.String({ minLength: 1, maxLength: 1_000 }),
  },
  { additionalProperties: false },
);

const CreatePursuitGapSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 240 }),
    basis: Type.Object(
      {
        kind: EvidenceBasisKindSchema,
        summary: Type.String({ minLength: 1, maxLength: 1_000 }),
        evidence_refs: Type.Array(Id, { maxItems: 50 }),
      },
      { additionalProperties: false },
    ),
    close_condition: Type.String({ minLength: 1, maxLength: 1_000 }),
  },
  { additionalProperties: false },
);

const CreatePursuitActionSchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 240 }),
    owner_user_id: Id,
    status: Type.Optional(Type.Literal("drafted")),
    due_at: Type.Optional(Timestamp),
  },
  { additionalProperties: false },
);

export const CreatePursuitRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    type: PursuitTypeSchema,
    title: Type.String({ minLength: 1, maxLength: 240 }),
    target_outcome: Type.String({ minLength: 1, maxLength: 160 }),
    target_date: CalendarDate,
    status: Type.Optional(
      Type.Union([Type.Literal("draft"), Type.Literal("active")]),
    ),
    milestone: Type.String({ minLength: 1, maxLength: 120 }),
    roles: Type.Optional(Type.Array(CreatePursuitRoleSchema, { maxItems: 100 })),
    criteria: Type.Optional(
      Type.Array(CreatePursuitCriterionSchema, { maxItems: 100 }),
    ),
    gaps: Type.Optional(Type.Array(CreatePursuitGapSchema, { maxItems: 100 })),
    actions: Type.Optional(
      Type.Array(CreatePursuitActionSchema, { maxItems: 100 }),
    ),
  },
  { $id: "CreatePursuitRequest", additionalProperties: false },
);

export const RevisePursuitRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    expected_revision: Type.Integer({ minimum: 1 }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    target_outcome: Type.Optional(
      Type.String({ minLength: 1, maxLength: 160 }),
    ),
    target_date: Type.Optional(CalendarDate),
    status: Type.Optional(PursuitStatusSchema),
    milestone: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { $id: "RevisePursuitRequest", additionalProperties: false },
);

const PursuitRoleSchema = Type.Object(
  {
    id: Id,
    pursuit_id: Id,
    subject_ref: SubjectReferenceSchema,
    role_type: Type.String(),
    status: PursuitRoleStatusSchema,
    confidence: PursuitRoleConfidenceSchema,
    basis: Type.Object(
      {
        kind: EvidenceBasisKindSchema,
        attributed_by_user_id: Type.Union([Id, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    evidence_refs: Type.Array(Id),
    evidence_state: EvidenceAuthoritySchema,
    revision: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const PursuitCriterionSchema = Type.Object(
  {
    id: Id,
    pursuit_id: Id,
    key: Type.String(),
    label: Type.String(),
    requirement: Type.String(),
    status: Type.Union([Type.Literal("active"), Type.Literal("retired")]),
    revision: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const PursuitGapSchema = Type.Object(
  {
    id: Id,
    pursuit_id: Id,
    title: Type.String(),
    status: Type.Union([
      Type.Literal("open"),
      Type.Literal("closed"),
      Type.Literal("dismissed"),
    ]),
    basis: Type.Object(
      {
        kind: EvidenceBasisKindSchema,
        summary: Type.String(),
        evidence_refs: Type.Array(Id),
        attributed_by_user_id: Type.Union([Id, Type.Null()]),
        evidence_state: EvidenceAuthoritySchema,
      },
      { additionalProperties: false },
    ),
    close_condition: Type.String(),
    revision: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const PursuitActionSchema = Type.Object(
  {
    id: Id,
    pursuit_id: Id,
    gap_id: Type.Union([Id, Type.Null()]),
    title: Type.String(),
    owner_user_id: Id,
    owner_display_name: Type.String({ minLength: 1, maxLength: 200 }),
    status: PursuitActionStatusSchema,
    due_at: Type.Union([Timestamp, Type.Null()]),
    outcome_summary: Type.Union([Type.String(), Type.Null()]),
    completed_at: Type.Union([Timestamp, Type.Null()]),
    external_effects: Type.Array(Type.Never(), { maxItems: 0 }),
    revision: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const CompletePursuitActionRequestSchema = Type.Object(
  {
    operation_id: Id,
    idempotency_key: IdempotencyKey,
    expected_pursuit_revision: Type.Integer({ minimum: 1 }),
    expected_action_revision: Type.Integer({ minimum: 1 }),
    outcome_summary: Type.String({ minLength: 1, maxLength: 1_000 }),
  },
  { $id: "CompletePursuitActionRequest", additionalProperties: false },
);

export const PursuitSchema = Type.Object(
  {
    id: Id,
    workspace_id: Id,
    type: PursuitTypeSchema,
    title: Type.String(),
    target_outcome: Type.String(),
    target_date: CalendarDate,
    status: PursuitStatusSchema,
    milestone: Type.String(),
    milestone_authority: Type.Object(
      {
        kind: EvidenceBasisKindSchema,
        evidence_refs: Type.Array(Id),
        evidence_state: EvidenceAuthoritySchema,
        confirmed_by_user_id: Type.Union([Id, Type.Null()]),
        confirmed_at: Type.Union([Timestamp, Type.Null()]),
        proposal_id: Type.Union([Id, Type.Null()]),
        receipt_id: Type.Union([Id, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    revision: Type.Integer({ minimum: 1 }),
    roles: Type.Array(PursuitRoleSchema),
    criteria: Type.Array(PursuitCriterionSchema),
    gaps: Type.Array(PursuitGapSchema),
    actions: Type.Array(PursuitActionSchema),
    created_at: Timestamp,
    updated_at: Timestamp,
  },
  { $id: "Pursuit", additionalProperties: false },
);

export const PursuitReceiptSchema = Type.Object(
  {
    id: Id,
    operation_id: Id,
    workspace_id: Id,
    actor_user_id: Id,
    operation_kind: Type.Union([
      Type.Literal("create_pursuit"),
      Type.Literal("revise_pursuit"),
      Type.Literal("review_pursuit_proposal"),
    ]),
    status: Type.Literal("applied"),
    proposal_id: Type.Union([Id, Type.Null()]),
    outcome: Type.Union([
      Type.Literal("canonical_applied"),
      Type.Literal("mixed_applied"),
      Type.Literal("rejected"),
      Type.Literal("kept_unresolved"),
    ]),
    entity_ref: Type.Object(
      {
        type: Type.Literal("pursuit"),
        id: Id,
        before_revision: Type.Integer({ minimum: 0 }),
        after_revision: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    changed_fields: Type.Array(Type.String({ minLength: 1, maxLength: 80 })),
    item_decisions: Type.Array(
      Type.Object(
        {
          item_id: Id,
          decision: Type.Union([
            Type.Literal("confirmed"),
            Type.Literal("edited"),
            Type.Literal("rejected"),
            Type.Literal("kept_unresolved"),
          ]),
          changed: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
    ),
    external_effects: Type.Array(Type.Never(), { maxItems: 0 }),
    summary: Type.String(),
    occurred_at: Timestamp,
  },
  { $id: "PursuitReceipt", additionalProperties: false },
);

export const PursuitMutationResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    pursuit: PursuitSchema,
    receipt: PursuitReceiptSchema,
  },
  { $id: "PursuitMutationResponse", additionalProperties: false },
);

export const PursuitDetailResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    pursuit: PursuitSchema,
  },
  { $id: "PursuitDetailResponse", additionalProperties: false },
);

export const PursuitListResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    workspace_id: Id,
    pursuits: Type.Array(PursuitSchema),
  },
  { $id: "PursuitListResponse", additionalProperties: false },
);

export const PursuitOperationResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    operation: Type.Object(
      {
        id: Id,
        pursuit_id: Id,
        proposal_id: Type.Union([Id, Type.Null()]),
        operation_kind: Type.Union([
          Type.Literal("create_pursuit"),
          Type.Literal("revise_pursuit"),
          Type.Literal("review_pursuit_proposal"),
        ]),
        status: Type.Union([
          Type.Literal("confirming"),
          Type.Literal("applied"),
          Type.Literal("conflict"),
          Type.Literal("failed"),
          Type.Literal("unknown_locked"),
        ]),
        before_revision: Type.Integer({ minimum: 0 }),
        after_revision: Type.Union([
          Type.Integer({ minimum: 1 }),
          Type.Null(),
        ]),
        reason: Type.String(),
        created_at: Timestamp,
        resolved_at: Type.Union([Timestamp, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    receipt: Type.Union([PursuitReceiptSchema, Type.Null()]),
    pursuit: PursuitSchema,
  },
  { $id: "PursuitOperationResponse", additionalProperties: false },
);

export type CreatePursuitRequest = Static<typeof CreatePursuitRequestSchema>;
export type RevisePursuitRequest = Static<typeof RevisePursuitRequestSchema>;
export type CompletePursuitActionRequest = Static<
  typeof CompletePursuitActionRequestSchema
>;
export type Pursuit = Static<typeof PursuitSchema>;
export type PursuitReceipt = Static<typeof PursuitReceiptSchema>;
export type PursuitMutationResponse = Static<
  typeof PursuitMutationResponseSchema
>;
export type PursuitDetailResponse = Static<
  typeof PursuitDetailResponseSchema
>;
export type PursuitListResponse = Static<typeof PursuitListResponseSchema>;
export type PursuitOperationResponse = Static<
  typeof PursuitOperationResponseSchema
>;
