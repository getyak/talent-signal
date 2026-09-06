import { z } from "zod";

const idempotencyKey = z.string().trim().min(1).max(200);
const labHash = z.string().regex(/^[a-f0-9]{64}$/u);
const labPromptPreset = z.enum(["baseline", "concise", "evidence_first"]);
const labJobTask = z.enum(["relationship_text", "relationship_image", "unscoped_chat"]);
const labFailureCategory = z.enum([
  "unsupported_claim",
  "wrong_identity",
  "missed_uncertainty",
  "stale_evidence",
  "unsafe_action",
  "bad_structure",
  "provider_failure",
  "latency",
  "other",
]);
const labConfiguration = z
  .object({
    model: z.string().trim().min(1).max(100),
    prompt_preset: labPromptPreset,
  })
  .strict();
const regressionSource = z
  .object({ id: z.uuid(), content_hash: labHash })
  .strict();

export const startLabSessionInputSchema = z
  .object({
    scenario_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const runLabScenarioInputSchema = z
  .object({
    variant: z.enum(["baseline", "candidate"]),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const compareLabScenarioInputSchema = z
  .object({ idempotency_key: idempotencyKey })
  .strict();

export const createRealityReceiptInputSchema = z
  .object({
    run_id: z.uuid(),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const promoteRealityReceiptInputSchema = z
  .object({
    decision: z.literal("promote"),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const labJobInputSchema = z
  .object({
    catalog_revision: labHash,
    task: labJobTask.optional(),
    id: z.uuid(),
    case_ids: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(20)
      .refine((values) => new Set(values).size === values.length),
    configurations: z.tuple([labConfiguration, labConfiguration]),
    repetitions: z.number().int().min(1).max(3),
    call_limit: z.number().int().min(2).max(120),
    regression_source: regressionSource.optional(),
  })
  .strict();

export const labJobReviewInputSchema = z
  .object({
    review: z.enum(["a", "b", "tie", "inconclusive"]),
    failure_categories: z
      .array(labFailureCategory)
      .max(9)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export const labRegressionInputSchema = z
  .object({
    id: z.uuid(),
    source_job_id: z.uuid(),
    source_attempt_id: z.uuid(),
    source_definition_hash: labHash,
    failure_categories: z
      .array(labFailureCategory)
      .min(1)
      .max(9)
      .refine((values) => new Set(values).size === values.length),
    expected_behavior: z.string().trim().min(1).max(2000),
    review_note: z.string().max(2000),
  })
  .strict();

export function isLabId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
