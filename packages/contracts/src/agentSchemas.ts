import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";

const Id = Type.String({ format: "uuid" });
const Timestamp = Type.String({ format: "date-time" });
const Fingerprint = Type.String({ pattern: "^[0-9a-f]{64}$" });
const NullableId = Type.Union([Id, Type.Null()]);

export const AgentToolNameSchema = Type.Union([
  Type.Literal("read_pursuit"),
  Type.Literal("read_evidence"),
  Type.Literal("stage_pursuit_proposal"),
  Type.Literal("record_no_action"),
]);

export const CreatePursuitAgentRunRequestSchema = Type.Object(
  {
    idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    capture_id: Id,
    base_revision: Type.Integer({ minimum: 1 }),
    objective: Type.String({ minLength: 1, maxLength: 1_000 }),
    evidence_refs: Type.Array(Id, {
      maxItems: 50,
      uniqueItems: true,
    }),
  },
  { $id: "CreatePursuitAgentRunRequest", additionalProperties: false },
);

export const AgentRunStatusSchema = Type.Union([
  Type.Literal("starting"),
  Type.Literal("running"),
  Type.Literal("proposal_staged"),
  Type.Literal("no_action"),
  Type.Literal("quarantined"),
  Type.Literal("budget_exhausted"),
  Type.Literal("cancelled"),
  Type.Literal("failed"),
]);

export const AgentFingerprintsSchema = Type.Object(
  {
    definition: Fingerprint,
    system_prompt: Fingerprint,
    tool_manifest: Fingerprint,
    sdk: Fingerprint,
    model: Fingerprint,
    policy: Fingerprint,
    contract: Fingerprint,
    context: Fingerprint,
  },
  { additionalProperties: false },
);

export const AgentUsageSchema = Type.Object(
  {
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
    total_tokens: Type.Integer({ minimum: 0 }),
    estimated_usd: Type.Number({ minimum: 0 }),
    turns: Type.Integer({ minimum: 0 }),
    tool_calls: Type.Integer({ minimum: 0 }),
    duration_ms: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const AgentTerminalReceiptSchema = Type.Object(
  {
    run_id: Id,
    status: Type.Exclude(
      Type.Exclude(AgentRunStatusSchema, Type.Literal("starting")),
      Type.Literal("running"),
    ),
    reason_code: Type.String({ minLength: 1, maxLength: 120 }),
    proposal_id: NullableId,
    no_action_id: NullableId,
    candidate_fingerprint: Type.Union([Fingerprint, Type.Null()]),
    external_effects: Type.Tuple([]),
    fingerprints: AgentFingerprintsSchema,
    usage: AgentUsageSchema,
    permission_denials: Type.Array(Type.String({ maxLength: 1_000 }), {
      maxItems: 100,
    }),
    provider_session_id: Type.Union([
      Type.String({ minLength: 1, maxLength: 200 }),
      Type.Null(),
    ]),
    completed_at: Timestamp,
  },
  { additionalProperties: false },
);

export const AgentRunSchema = Type.Object(
  {
    id: Id,
    workspace_id: Id,
    user_id: Id,
    pursuit_id: Id,
    capture_id: Id,
    base_revision: Type.Integer({ minimum: 1 }),
    objective: Type.String(),
    definition: Type.Object(
      {
        name: Type.String(),
        version: Type.String(),
        policy_version: Type.String(),
        contract_version: Type.Literal(CONTRACT_VERSION),
        tool_manifest: Type.Array(AgentToolNameSchema, {
          minItems: 4,
          maxItems: 4,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
    provider: Type.Object(
      {
        id: Type.String(),
        model: Type.String(),
        sdk_version: Type.String(),
      },
      { additionalProperties: false },
    ),
    budget: Type.Object(
      {
        max_turns: Type.Integer({ minimum: 1, maximum: 6 }),
        max_tool_calls: Type.Integer({ minimum: 1, maximum: 12 }),
        max_duration_ms: Type.Integer({ minimum: 1, maximum: 60_000 }),
        max_task_tokens: Type.Integer({ minimum: 1, maximum: 32_000 }),
        max_estimated_usd: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
      },
      { additionalProperties: false },
    ),
    context_manifest: Type.Object(
      {
        pursuit_revision: Type.Integer({ minimum: 1 }),
        evidence: Type.Array(
          Type.Object(
            {
              fragment_id: Id,
              content_hash: Fingerprint,
              inclusion_reason: Type.String(),
              authorization_scope: Type.String(),
            },
            { additionalProperties: false },
          ),
          { maxItems: 50 },
        ),
      },
      { additionalProperties: false },
    ),
    fingerprints: AgentFingerprintsSchema,
    status: AgentRunStatusSchema,
    usage: AgentUsageSchema,
    terminal_receipt: Type.Union([AgentTerminalReceiptSchema, Type.Null()]),
    external_effects: Type.Tuple([]),
    created_at: Timestamp,
    started_at: Type.Union([Timestamp, Type.Null()]),
    completed_at: Type.Union([Timestamp, Type.Null()]),
  },
  { $id: "AgentRun", additionalProperties: false },
);

export const AgentRunResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    run: AgentRunSchema,
  },
  { $id: "AgentRunResponse", additionalProperties: false },
);

export type CreatePursuitAgentRunRequest = Static<
  typeof CreatePursuitAgentRunRequestSchema
>;
export type AgentRun = Static<typeof AgentRunSchema>;
export type AgentRunResponse = Static<typeof AgentRunResponseSchema>;
