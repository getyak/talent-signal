import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";
import {
  EvidenceAuthoritySchema,
  EvidenceBasisKindSchema,
  PursuitRoleStatusSchema,
  PursuitSchema,
  PursuitStatusSchema,
  PursuitReceiptSchema,
} from "./pursuitSchemas.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const IdempotencyKey = Type.String({ minLength: 1, maxLength: 128 });

export const ProposalBasisKindSchema = EvidenceBasisKindSchema;

export const EpistemicStatusSchema = Type.Union([
  Type.Literal("fact"),
  Type.Literal("inference"),
  Type.Literal("unknown"),
  Type.Literal("disputed"),
  Type.Literal("superseded"),
]);

const ProposalItemCommon = {
  item_key: Type.String({ minLength: 1, maxLength: 80 }),
  basis_kind: ProposalBasisKindSchema,
  epistemic_status: EpistemicStatusSchema,
  evidence_refs: Type.Array(Id, { maxItems: 50 }),
  reason: Type.String({ minLength: 1, maxLength: 1_000 }),
  effect_summary: Type.String({ minLength: 1, maxLength: 500 }),
};

const StageProposalItemSchema = Type.Union([
  Type.Object(
    {
      ...ProposalItemCommon,
      change: Type.Object(
        {
          kind: Type.Literal("set_milestone"),
          proposed_value: Type.String({ minLength: 1, maxLength: 120 }),
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...ProposalItemCommon,
      change: Type.Object(
        {
          kind: Type.Literal("set_pursuit_status"),
          proposed_value: PursuitStatusSchema,
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...ProposalItemCommon,
      change: Type.Object(
        {
          kind: Type.Literal("set_role_status"),
          role_id: Id,
          proposed_value: PursuitRoleStatusSchema,
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...ProposalItemCommon,
      change: Type.Object(
        {
          kind: Type.Literal("add_gap"),
          proposed_value: Type.Object(
            {
              title: Type.String({ minLength: 1, maxLength: 240 }),
              basis_summary: Type.String({ minLength: 1, maxLength: 1_000 }),
              close_condition: Type.String({ minLength: 1, maxLength: 1_000 }),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...ProposalItemCommon,
      change: Type.Object(
        {
          kind: Type.Literal("add_action"),
          proposed_value: Type.Object(
            {
              title: Type.String({ minLength: 1, maxLength: 240 }),
              owner_user_id: Id,
              due_at: Type.Union([Timestamp, Type.Null()]),
            },
            { additionalProperties: false },
          ),
        },
        { additionalProperties: true },
      ),
    },
    { additionalProperties: false },
  ),
]);

export const StagePursuitProposalRequestSchema = Type.Object(
  {
    idempotency_key: IdempotencyKey,
    proposal_id: Type.Optional(Id),
    capture_id: Id,
    base_revision: Type.Integer({ minimum: 1 }),
    summary: Type.String({ minLength: 1, maxLength: 1_000 }),
    producer: Type.Object(
      {
        kind: Type.Union([Type.Literal("agent"), Type.Literal("human")]),
        name: Type.String({ minLength: 1, maxLength: 120 }),
        version: Type.String({ minLength: 1, maxLength: 80 }),
        run_id: Type.String({ minLength: 1, maxLength: 160 }),
      },
      { additionalProperties: false },
    ),
    items: Type.Array(StageProposalItemSchema, {
      minItems: 1,
      maxItems: 50,
    }),
  },
  { $id: "StagePursuitProposalRequest", additionalProperties: false },
);

export const ProposalDecisionSchema = Type.Union([
  Type.Literal("confirm"),
  Type.Literal("edit"),
  Type.Literal("reject"),
  Type.Literal("keep_unresolved"),
]);

export const ReviewPursuitProposalRequestSchema = Type.Object(
  {
    operation_id: Id,
    idempotency_key: IdempotencyKey,
    base_revision: Type.Integer({ minimum: 1 }),
    reason: Type.String({ minLength: 1, maxLength: 1_000 }),
    decisions: Type.Array(
      Type.Object(
        {
          item_id: Id,
          decision: ProposalDecisionSchema,
          edited_value: Type.Optional(Type.Unknown()),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { $id: "ReviewPursuitProposalRequest", additionalProperties: false },
);

export const PursuitProposalStatusSchema = Type.Union([
  Type.Literal("needs_review"),
  Type.Literal("confirming"),
  Type.Literal("applied"),
  Type.Literal("rejected"),
  Type.Literal("kept_unresolved"),
  Type.Literal("conflict"),
  Type.Literal("failed"),
  Type.Literal("superseded"),
]);

export const PursuitProposalItemSchema = Type.Object(
  {
    id: Id,
    item_key: Type.String(),
    change_kind: Type.Union([
      Type.Literal("set_milestone"),
      Type.Literal("set_pursuit_status"),
      Type.Literal("set_role_status"),
      Type.Literal("add_gap"),
      Type.Literal("add_action"),
    ]),
    target: Type.Object(
      {
        entity_type: Type.Union([
          Type.Literal("pursuit"),
          Type.Literal("pursuit_role"),
          Type.Literal("pursuit_gap"),
          Type.Literal("pursuit_action"),
        ]),
        entity_id: Type.Union([Id, Type.Null()]),
        field: Type.String(),
      },
      { additionalProperties: false },
    ),
    before_value: Type.Unknown(),
    proposed_value: Type.Unknown(),
    basis_kind: ProposalBasisKindSchema,
    attributed_by_user_id: Type.Union([Id, Type.Null()]),
    epistemic_status: EpistemicStatusSchema,
    evidence_refs: Type.Array(Id),
    evidence_state: EvidenceAuthoritySchema,
    reason: Type.String(),
    effect_summary: Type.String(),
    decision: Type.Object(
      {
        status: Type.Union([
          Type.Literal("pending"),
          Type.Literal("confirmed"),
          Type.Literal("edited"),
          Type.Literal("rejected"),
          Type.Literal("kept_unresolved"),
        ]),
        decided_value: Type.Unknown(),
        decided_by_user_id: Type.Union([Id, Type.Null()]),
        reason: Type.Union([Type.String(), Type.Null()]),
        decided_at: Type.Union([Timestamp, Type.Null()]),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const PursuitProposalSchema = Type.Object(
  {
    id: Id,
    workspace_id: Id,
    pursuit_id: Id,
    capture_id: Id,
    base_revision: Type.Integer({ minimum: 1 }),
    summary: Type.String(),
    producer: Type.Object(
      {
        kind: Type.Union([Type.Literal("agent"), Type.Literal("human")]),
        name: Type.String(),
        version: Type.String(),
        run_id: Type.String(),
      },
      { additionalProperties: false },
    ),
    status: PursuitProposalStatusSchema,
    revision: Type.Integer({ minimum: 1 }),
    evidence_state: EvidenceAuthoritySchema,
    review_context: Type.Object(
      {
        pursuit: Type.Object(
          {
            id: Id,
            title: Type.String(),
          },
          { additionalProperties: false },
        ),
        capture: Type.Object(
          {
            id: Id,
            purpose: Type.String(),
          },
          { additionalProperties: false },
        ),
        subject: Type.Object(
          {
            person_id: Id,
            display_label: Type.String(),
            contextual_roles: Type.Array(
              Type.Object(
                {
                  role_type: Type.String(),
                  status: PursuitRoleStatusSchema,
                  confidence: Type.Union([
                    Type.Literal("confirmed"),
                    Type.Literal("suggested"),
                  ]),
                },
                { additionalProperties: false },
              ),
            ),
          },
          { additionalProperties: false },
        ),
        evidence: Type.Array(
          Type.Object(
            {
              fragment_id: Id,
              text: Type.Union([Type.String(), Type.Null()]),
              fragment_kind: Type.String(),
              fragment_status: Type.String(),
              observed_at: Timestamp,
              source_timezone: Type.Union([Type.String(), Type.Null()]),
              source_display_name: Type.String(),
              input_channel: Type.String(),
              source_processing_state: Type.String(),
              attributed_actor: Type.String(),
              attribution_status: Type.Union([
                Type.Literal("confirmed"),
                Type.Literal("proposed"),
                Type.Literal("unknown"),
              ]),
              review_status: Type.String(),
              parser: Type.Object(
                {
                  name: Type.String(),
                  version: Type.String(),
                },
                { additionalProperties: false },
              ),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    items: Type.Array(PursuitProposalItemSchema),
    created_at: Timestamp,
    updated_at: Timestamp,
  },
  { $id: "PursuitProposal", additionalProperties: false },
);

export const PursuitProposalResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    proposal: PursuitProposalSchema,
  },
  { $id: "PursuitProposalResponse", additionalProperties: false },
);

export const PursuitProposalListResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    workspace_id: Id,
    proposals: Type.Array(PursuitProposalSchema, { maxItems: 100 }),
  },
  { $id: "PursuitProposalListResponse", additionalProperties: false },
);

export const PursuitProposalReviewResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    proposal: PursuitProposalSchema,
    pursuit: PursuitSchema,
    receipt: PursuitReceiptSchema,
  },
  { $id: "PursuitProposalReviewResponse", additionalProperties: false },
);

export type StagePursuitProposalRequest = Static<
  typeof StagePursuitProposalRequestSchema
>;
export type ReviewPursuitProposalRequest = Static<
  typeof ReviewPursuitProposalRequestSchema
>;
export type PursuitProposal = Static<typeof PursuitProposalSchema>;
export type PursuitProposalItem = Static<typeof PursuitProposalItemSchema>;
export type PursuitProposalResponse = Static<
  typeof PursuitProposalResponseSchema
>;
export type PursuitProposalListResponse = Static<
  typeof PursuitProposalListResponseSchema
>;
export type PursuitProposalReviewResponse = Static<
  typeof PursuitProposalReviewResponseSchema
>;
