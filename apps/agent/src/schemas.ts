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
export const SearchWebInputSchema = z.strictObject({
  query: z.string().trim().min(2).max(240),
  maximum_results: z.number().int().min(1).max(10).default(5),
  recency_days: z.number().int().min(1).max(3_650).nullable().default(null),
});
export const FetchWebInputSchema = z.strictObject({
  result_id: z.string().regex(/^[0-9a-f]{64}$/),
});
export const SearchPublicProfilesInputSchema = z.strictObject({
  visible_identity_clue: z.string().trim().min(2).max(100),
  source_artifact_id: z.string().trim().min(1).max(200),
  maximum_results: z.number().int().min(1).max(10).default(5),
});
export const CreateResearchArtifactInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(8_000),
  limitations: z.string().trim().max(2_000).default(""),
  claims: z
    .array(
      z.strictObject({
        statement: z.string().trim().min(1).max(1_000),
        source_refs: z
          .array(z.string().regex(/^[0-9a-f]{64}$/))
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(20),
});
export const CreatePersonResearchArtifactInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(8_000),
  limitations: z.string().trim().min(1).max(2_000),
  identity_status: z.enum(["possible_match", "ambiguous"]),
  observed_clues: z
    .array(
      z.strictObject({
        kind: z.enum(["display_name", "handle", "profile_url", "platform"]),
        value: z.string().trim().min(1).max(300),
        source_artifact_id: z.string().trim().min(1).max(200),
        observation_status: z.literal("unreviewed_screenshot_observation"),
      }),
    )
    .min(1)
    .max(10),
  candidates: z
    .array(
      z.strictObject({
        result_id: z.string().regex(/^[0-9a-f]{64}$/u),
        match_basis: z.string().trim().min(1).max(1_000),
      }),
    )
    .min(1)
    .max(10),
  claims: z
    .array(
      z.strictObject({
        statement: z.string().trim().min(1).max(1_000),
        epistemic_status: z.enum(["provider_observation", "agent_inference"]),
        source_refs: z
          .array(z.string().regex(/^[0-9a-f]{64}$/u))
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(20),
});
export const StageProposalInputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1_000),
  items: z.array(ProposalItemSchema).min(1).max(50),
});
export const PursuitNoActionReasonCodeSchema = z.enum([
  "NO_MATERIAL_CHANGE",
  "INSUFFICIENT_EVIDENCE",
  "UNTRUSTED_INSTRUCTION",
  "AMBIGUOUS_TIME",
  "PROHIBITED_PERSON_ASSESSMENT",
  "UNSUPPORTED_INPUT_CAPABILITY",
]);
export const PublicResearchNoActionReasonCodeSchema = z.enum([
  "NO_MATERIAL_CHANGE",
  "INSUFFICIENT_EVIDENCE",
  "UNTRUSTED_INSTRUCTION",
  "PUBLIC_RESEARCH_UNAVAILABLE",
]);
export const PersonResearchNoActionReasonCodeSchema = z.enum([
  "NO_VISIBLE_IDENTITY_CLUE",
  "AMBIGUOUS_IDENTITY_CLUE",
  "NO_PUBLIC_PROFILE_MATCH",
  "UNTRUSTED_INSTRUCTION",
  "PROHIBITED_PERSON_ASSESSMENT",
  "PERSON_RESEARCH_UNAVAILABLE",
]);
const NoActionFields = {
  outcome: z.literal("no_action"),
  reason: z.string().trim().min(1).max(1_000),
  missing_evidence_refs: z.array(Id).max(50).default([]),
};
export const PursuitNoActionOutputSchema = z.strictObject({
  ...NoActionFields,
  reason_code: PursuitNoActionReasonCodeSchema,
});
export const PublicResearchNoActionOutputSchema = z.strictObject({
  ...NoActionFields,
  reason_code: PublicResearchNoActionReasonCodeSchema,
});
export const PersonResearchNoActionOutputSchema = z.strictObject({
  outcome: z.literal("no_action"),
  reason_code: PersonResearchNoActionReasonCodeSchema,
  reason: z.string().trim().min(1).max(1_000),
  missing_evidence_refs: z.array(z.never()).max(0).default([]),
});
export const NoActionOutputSchema = z.strictObject({
  ...NoActionFields,
  reason_code: z.union([
    PursuitNoActionReasonCodeSchema,
    PublicResearchNoActionReasonCodeSchema,
  ]),
});
const ProposalOutputSchema = z.strictObject({
  outcome: z.literal("proposal"),
  candidate_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
const ArtifactOutputSchema = z.strictObject({
  outcome: z.literal("artifact"),
  candidate_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
const PersonResearchArtifactOutputSchema = z.strictObject({
  outcome: z.literal("person_research_artifact"),
  candidate_fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
});

export const PursuitAgentFinalOutputSchema = z.discriminatedUnion("outcome", [
  ProposalOutputSchema,
  PursuitNoActionOutputSchema,
]);
export const PublicResearchAgentFinalOutputSchema = z.discriminatedUnion(
  "outcome",
  [ArtifactOutputSchema, PublicResearchNoActionOutputSchema],
);
export const PersonResearchAgentFinalOutputSchema = z.discriminatedUnion(
  "outcome",
  [PersonResearchArtifactOutputSchema, PersonResearchNoActionOutputSchema],
);

export const AgentFinalOutputSchema = z.discriminatedUnion("outcome", [
  ProposalOutputSchema,
  NoActionOutputSchema,
  ArtifactOutputSchema,
]);

export type StageProposalInput = z.infer<typeof StageProposalInputSchema>;
export type NoActionOutput = z.infer<typeof NoActionOutputSchema>;
export type PursuitNoActionOutput = z.infer<
  typeof PursuitNoActionOutputSchema
>;
export type PublicResearchNoActionOutput = z.infer<
  typeof PublicResearchNoActionOutputSchema
>;
export type NoActionReasonCode = NoActionOutput["reason_code"];
export type CreateResearchArtifactInput = z.infer<
  typeof CreateResearchArtifactInputSchema
>;
export type CreatePersonResearchArtifactInput = z.infer<
  typeof CreatePersonResearchArtifactInputSchema
>;
export type PersonResearchNoActionOutput = z.infer<
  typeof PersonResearchNoActionOutputSchema
>;
