import { z } from "zod";

const Id = z.string().uuid();
const TraceId = z.string().regex(/^[0-9a-f]{32}$/);
const SpanId = z.string().regex(/^[0-9a-f]{16}$/);

export const pursuitAgentRunInputSchema = z.strictObject({
  pursuit_id: Id,
  idempotency_key: z.string().trim().min(1).max(128),
  capture_id: Id,
  base_revision: z.number().int().min(1),
  objective: z.string().trim().min(1).max(1_000),
  evidence_refs: z.array(Id).max(50),
  input_artifact_refs: z.array(Id).max(5).optional(),
  telemetry: z
    .strictObject({
      trace_id: TraceId,
      parent_span_id: SpanId,
      interaction_id: Id,
    })
    .optional(),
});

export const pursuitAgentTaskInputSchema = z.strictObject({
  pursuit_id: Id,
  idempotency_key: z.string().trim().min(1).max(128),
  client_event_id: Id.optional(),
  expected_revision: z.number().int().min(1),
  task_kind: z.literal("pre_call_briefing").optional(),
  capture_id: Id,
  objective: z.string().trim().min(1).max(1_000),
  evidence_refs: z.array(Id).max(50),
  input_artifact_refs: z.array(Id).max(5).optional(),
  telemetry: z
    .strictObject({
      trace_id: TraceId,
      parent_span_id: SpanId,
      interaction_id: Id,
    })
    .optional(),
});

export const cancelAgentTaskInputSchema = z.strictObject({
  idempotency_key: z.string().trim().min(1).max(128),
  expected_revision: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
});

export const pursuitProposalReviewInputSchema = z.strictObject({
  operation_id: Id,
  idempotency_key: z.string().trim().min(1).max(128),
  base_revision: z.number().int().min(1),
  reason: z.string().trim().min(1).max(1_000),
  decisions: z
    .array(
      z.strictObject({
        item_id: Id,
        decision: z.enum([
          "confirm",
          "edit",
          "reject",
          "keep_unresolved",
        ]),
        edited_value: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const agentDecisionBundleResolveInputSchema = z.strictObject({
  operation_id: Id,
  idempotency_key: z.string().trim().min(1).max(128),
  expected_task_revision: z.number().int().min(1),
  expected_bundle_revision: z.number().int().min(1),
  base_revision: z.number().int().min(1),
  reason: z.string().trim().min(1).max(1_000),
  decisions: z
    .array(
      z.strictObject({
        item_id: Id,
        decision: z.enum(["accept", "edit", "reject", "keep_unresolved"]),
        edited_value: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(50),
});
