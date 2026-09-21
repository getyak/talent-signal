import { z } from "zod";

/**
 * Typed Agent recall/stage capability for the three-scope Memory review. The
 * model can read current authorized memory and stage review-only candidates;
 * it can never accept memory or create a contact.
 */

const Id = z.string().uuid();
const MemoryScopeSchema = z.enum(["self", "person", "relationship"]);
const MemoryOperationSchema = z.enum(["add", "update", "contest"]);
const MemoryStatementKindSchema = z.enum([
  "fact",
  "source_statement",
  "user_opinion",
]);
const MemoryTimeStatusSchema = z.enum(["known", "unknown", "future", "past"]);
const MemorySensitivitySchema = z.enum(["normal", "sensitive"]);
const MemoryContactDecisionSchema = z.enum(["existing", "new", "none"]);

export const MemorySourceLocatorInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("message"),
    session_id: Id.nullable().optional(),
    message_id: Id.nullable().optional(),
    character_start: z.number().int().min(0).optional(),
    character_end: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    kind: z.literal("image_region"),
    artifact_id: z.string().min(1).max(200),
    session_id: Id.nullable().optional(),
    image_index: z.number().int().min(0).max(9).optional(),
    region: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      })
      .strict()
      .nullable()
      .optional(),
  }),
  z.strictObject({
    kind: z.literal("document"),
    source_resource_id: Id.nullable().optional(),
    locator: z.record(z.string(), z.unknown()),
  }),
]);

export const MemoryProposalCandidateInputSchema = z.strictObject({
  scope: MemoryScopeSchema,
  operation: MemoryOperationSchema,
  statement_kind: MemoryStatementKindSchema,
  dependence_kind: z
    .enum(["independent_self", "contact", "relationship"])
    .optional(),
  display_text: z.string().trim().min(1).max(1_000),
  subject_id: Id.nullable().optional(),
  relationship_context_id: Id.nullable().optional(),
  speaker: z.string().max(200).nullable().optional(),
  reporter: z.string().max(200).nullable().optional(),
  valid_time: z.string().datetime().nullable().optional(),
  observed_time: z.string().datetime().nullable().optional(),
  time_status: MemoryTimeStatusSchema,
  sensitivity: MemorySensitivitySchema,
  source_excerpt: z.string().trim().min(1).max(4_000),
  source_locator: MemorySourceLocatorInputSchema,
  previous_memory_item_id: Id.nullable().optional(),
  previous_text: z.string().max(1_000).nullable().optional(),
  previous_revision: z.number().int().min(1).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
});

/**
 * Model-facing superset object. Claude's in-process MCP helper consumes a Zod
 * object shape; the executor always re-parses with the discriminated union.
 */
export const MemoryReviewToolInputSchema = z.strictObject({
  operation: z.enum(["recall", "propose"]),
  person_id: Id.nullable().optional(),
  relationship_context_id: Id.nullable().optional(),
  contact_decision: MemoryContactDecisionSchema.optional(),
  person_display_label: z.string().max(200).nullable().optional(),
  new_contact_source_locator: MemorySourceLocatorInputSchema.nullable().optional(),
  items: z.array(MemoryProposalCandidateInputSchema).min(1).max(40).optional(),
});

export const MemoryReviewInputSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("recall"),
    person_id: Id.nullable().optional(),
    relationship_context_id: Id.nullable().optional(),
  }),
  z.strictObject({
    operation: z.literal("propose"),
    person_id: Id.nullable().optional(),
    relationship_context_id: Id.nullable().optional(),
    contact_decision: MemoryContactDecisionSchema,
    person_display_label: z.string().max(200).nullable().optional(),
    new_contact_source_locator: MemorySourceLocatorInputSchema.nullable().optional(),
    items: z.array(MemoryProposalCandidateInputSchema).min(1).max(40),
  }),
]);

export type MemoryReviewToolInput = z.infer<typeof MemoryReviewToolInputSchema>;
export type MemoryReviewInput = z.infer<typeof MemoryReviewInputSchema>;
export type MemoryProposalCandidateInput = z.infer<
  typeof MemoryProposalCandidateInputSchema
>;

/**
 * Ground every image/document locator in an artifact admitted to this Run.
 * Name-only or face similarity is never accepted as a stable identity clue.
 */
export function memoryLocatorAdmissionError(
  items: readonly MemoryProposalCandidateInput[],
  admittedArtifactIds: readonly string[],
): string | null {
  const admitted = new Set(admittedArtifactIds);
  for (const item of items) {
    if (item.source_locator.kind === "image_region") {
      if (!admitted.has(item.source_locator.artifact_id)) {
        return `MEMORY_SOURCE_ARTIFACT_NOT_ADMITTED:${item.source_locator.artifact_id}`;
      }
    }
  }
  return null;
}

export const MEMORY_RELATIONSHIP_RECALL_DESCRIPTION =
  "Recall accepted, still-authorized Memory for the exact relationship of this chat. Returns only this contact's person/relationship statements with their statement kind and time; private self memory is never returned here. Read before answering a recollection question.";

/** Host-only hooks the relationship Chat provider exposes as one typed tool. */
export interface RemoteChatMemoryProposalReference {
  proposal_id: string;
  proposal_revision: number;
  item_count: number;
  default_selected_count: number;
}

export interface RemoteChatMemoryReviewHooks {
  recall(): Promise<{
    items: Array<{
      id: string;
      scope: "self" | "person" | "relationship";
      statement_kind: "fact" | "source_statement" | "user_opinion";
      display_text: string;
      speaker: string | null;
      reporter: string | null;
      valid_time: string | null;
      time_status: "known" | "unknown" | "future" | "past";
    }>;
  }>;
  stage(input: {
    contact_decision: "existing" | "new" | "none";
    person_display_label?: string | null;
    items: MemoryProposalCandidateInput[];
  }): Promise<RemoteChatMemoryProposalReference | null>;
}

export const MEMORY_REVIEW_TOOL_DESCRIPTION = [
  "Recall or stage the three-scope Memory review for the authenticated account.",
  'Use {"operation":"recall"} to read accepted, still-valid self/person/relationship memory for the current task scope before answering. Private self memory is never available on a relationship-scoped business view.',
  'Use {"operation":"propose", ...} only when the current admitted user message and/or admitted images contain a worthwhile, durable change.',
  "Each item must copy one exact contiguous excerpt from the admitted source, name its scope, keep the statement kind (fact, source statement, or user opinion), and preserve speaker/reporter, time, and limiting conditions.",
  "Never infer a person's personality, motive, quality, or acceptance from one message, and never turn 'I want to work with X' into a mutual agreement. A future plan is not a completed fact.",
  "This tool never writes accepted memory or a contact; it stages a review card that the human confirms, edits, or skips.",
].join(" ");
