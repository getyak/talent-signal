import { z } from "zod";

const Id = z.string().uuid();
const EvidenceRefs = z.array(Id).min(1).max(50);

const ProposalItemCommon = {
  item_key: z.string().trim().min(1).max(80),
  basis_kind: z.literal("evidence_supported"),
  epistemic_status: z.enum(["fact", "inference", "unknown", "disputed"]),
  evidence_refs: EvidenceRefs,
  reason: z.string().trim().min(1).max(1_000),
  effect_summary: z.string().trim().min(1).max(500),
};

const ProposalItemSchema = z.discriminatedUnion("change_kind", [
  z.strictObject({
    ...ProposalItemCommon,
    change_kind: z.literal("set_milestone"),
    proposed_value: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    ...ProposalItemCommon,
    change_kind: z.literal("set_pursuit_status"),
    proposed_value: z.enum([
      "draft",
      "active",
      "paused",
      "succeeded",
      "failed",
      "cancelled",
    ]),
  }),
  z.strictObject({
    ...ProposalItemCommon,
    change_kind: z.literal("set_role_status"),
    role_id: Id,
    proposed_value: z.enum(["active", "quiet", "removed"]),
  }),
  z.strictObject({
    ...ProposalItemCommon,
    change_kind: z.literal("add_gap"),
    proposed_value: z.strictObject({
      title: z.string().trim().min(1).max(240),
      basis_summary: z.string().trim().min(1).max(1_000),
      close_condition: z.string().trim().min(1).max(1_000),
    }),
  }),
  z.strictObject({
    ...ProposalItemCommon,
    change_kind: z.literal("add_action"),
    proposed_value: z.strictObject({
      title: z.string().trim().min(1).max(240),
      owner_user_id: Id,
      due_at: z.iso.datetime().nullable(),
    }),
  }),
]);

export const ReadPursuitInputSchema = z.strictObject({});
export const ReadEvidenceInputSchema = z.strictObject({
  evidence_refs: EvidenceRefs,
});
export const StageProposalInputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1_000),
  items: z.array(ProposalItemSchema).min(1).max(50),
});
export const NoActionReasonCodeSchema = z.enum([
  "NO_MATERIAL_CHANGE",
  "INSUFFICIENT_EVIDENCE",
  "UNTRUSTED_INSTRUCTION",
  "AMBIGUOUS_TIME",
  "PROHIBITED_PERSON_ASSESSMENT",
  "UNSUPPORTED_INPUT_CAPABILITY",
]);
export const RecordNoActionInputSchema = z.strictObject({
  reason_code: NoActionReasonCodeSchema,
  reason: z.string().trim().min(1).max(1_000),
  missing_evidence_refs: z.array(Id).max(50).default([]),
});

export const AgentFinalOutputSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("proposal"),
    candidate_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.strictObject({
    outcome: z.literal("no_action"),
    candidate_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);

export type StageProposalInput = z.infer<typeof StageProposalInputSchema>;
export type RecordNoActionInput = z.infer<typeof RecordNoActionInputSchema>;
export type NoActionReasonCode = z.infer<typeof NoActionReasonCodeSchema>;
