import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

/**
 * Durable conversation queue contract.
 *
 * Admission is separate from model execution: the client receives a 202
 * receipt once a queue row is committed, then observes the run through a
 * snapshot/stream. Queue data inherits Session ownership and deadline.
 */
const obj = { additionalProperties: false } as const;
const id = Type.String({ format: "uuid" });
const stamp = Type.String({ format: "date-time" });
const bounded = (maxLength: number) => Type.String({ minLength: 1, maxLength });

export const ConversationQueueEntryStatusSchema = Type.Union([
  Type.Literal("queued"),
  Type.Literal("running"),
  Type.Literal("completed"),
  Type.Literal("failed"),
  Type.Literal("cancelled"),
  Type.Literal("interrupted"),
]);

export type ConversationQueueEntryStatus = Static<
  typeof ConversationQueueEntryStatusSchema
>;

export const ConversationQueueEntrySchema = Type.Object(
  {
    queue_entry_id: id,
    message_id: id,
    sequence: Type.Integer({ minimum: 1 }),
    status: ConversationQueueEntryStatusSchema,
    objective: Type.String({ minLength: 1, maxLength: 1_000 }),
    created_at: stamp,
    updated_at: stamp,
    revision: Type.Integer({ minimum: 1 }),
    run_id: Type.Union([id, Type.Null()]),
    stage: Type.Union([bounded(40), Type.Null()]),
    cancel_requested: Type.Boolean(),
    failure_code: Type.Union([bounded(80), Type.Null()]),
  },
  obj,
);

export type ConversationQueueEntry = Static<
  typeof ConversationQueueEntrySchema
>;

export const ConversationQueuePreviewSchema = Type.Object(
  {
    run_id: id,
    message_id: id,
    text: Type.String({ maxLength: 12_000 }),
    stage: Type.Union([bounded(40), Type.Null()]),
    revision: Type.Integer({ minimum: 1 }),
  },
  obj,
);

export type ConversationQueuePreview = Static<
  typeof ConversationQueuePreviewSchema
>;

export const ConversationQueueSnapshotSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    session_id: id,
    revision: Type.Integer({ minimum: 0 }),
    paused: Type.Boolean(),
    active: Type.Union([ConversationQueueEntrySchema, Type.Null()]),
    queued: Type.Array(ConversationQueueEntrySchema, { maxItems: 50 }),
    preview: Type.Union([ConversationQueuePreviewSchema, Type.Null()]),
  },
  obj,
);

export type ConversationQueueSnapshot = Static<
  typeof ConversationQueueSnapshotSchema
>;

export const ConversationQueueAdmitRequestSchema = Type.Object(
  {
    idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    session_id: id,
    message_id: id,
    objective: Type.String({ minLength: 1, maxLength: 1_000 }),
    time_zone: Type.Optional(bounded(100)),
  },
  obj,
);

export type ConversationQueueAdmitRequest = Static<
  typeof ConversationQueueAdmitRequestSchema
>;

export const ConversationQueueAdmitResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    session_id: id,
    message_id: id,
    queue_entry_id: id,
    run_id: Type.Union([id, Type.Null()]),
    status: ConversationQueueEntryStatusSchema,
    sequence: Type.Integer({ minimum: 1 }),
    revision: Type.Integer({ minimum: 1 }),
    snapshot_revision: Type.Integer({ minimum: 0 }),
    accepted_at: stamp,
  },
  obj,
);

export type ConversationQueueAdmitResponse = Static<
  typeof ConversationQueueAdmitResponseSchema
>;

export const ConversationQueueMutationRequestSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("edit"),
      queue_entry_id: id,
      expected_revision: Type.Integer({ minimum: 0 }),
      idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
      objective: Type.String({ minLength: 1, maxLength: 1_000 }),
    },
    obj,
  ),
  Type.Object(
    {
      kind: Type.Literal("withdraw"),
      queue_entry_id: id,
      expected_revision: Type.Integer({ minimum: 0 }),
      idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    },
    obj,
  ),
  Type.Object(
    {
      kind: Type.Literal("retry"),
      queue_entry_id: id,
      expected_revision: Type.Integer({ minimum: 0 }),
      idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    },
    obj,
  ),
  Type.Object(
    {
      kind: Type.Literal("continue"),
      expected_revision: Type.Integer({ minimum: 0 }),
      idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
    },
    obj,
  ),
  Type.Object(
    {
      kind: Type.Literal("stop"),
      expected_revision: Type.Integer({ minimum: 0 }),
      idempotency_key: Type.String({ minLength: 1, maxLength: 128 }),
      run_id: id,
    },
    obj,
  ),
], { $id: "ConversationQueueMutationRequest" });

export type ConversationQueueMutationRequest = Static<
  typeof ConversationQueueMutationRequestSchema
>;

export const ConversationQueueAppliedSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("edit"),
      Type.Literal("withdraw"),
      Type.Literal("retry"),
      Type.Literal("continue"),
      Type.Literal("stop"),
    ]),
    queue_entry_id: Type.Union([id, Type.Null()]),
    run_id: Type.Union([id, Type.Null()]),
    status: Type.Union([ConversationQueueEntryStatusSchema, Type.Null()]),
  },
  obj,
);

export type ConversationQueueApplied = Static<
  typeof ConversationQueueAppliedSchema
>;

export const ConversationQueueMutationResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    snapshot: ConversationQueueSnapshotSchema,
    applied: ConversationQueueAppliedSchema,
  },
  obj,
);

export type ConversationQueueMutationResponse = Static<
  typeof ConversationQueueMutationResponseSchema
>;
