import { z } from "zod";

const Id = z.string().uuid();

export const pursuitAgentRunInputSchema = z.strictObject({
  pursuit_id: Id,
  idempotency_key: z.string().trim().min(1).max(128),
  capture_id: Id,
  base_revision: z.number().int().min(1),
  objective: z.string().trim().min(1).max(1_000),
  evidence_refs: z.array(Id).max(50),
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
