import { z } from "zod";

const idempotencyKey = z.string().trim().min(1).max(200);

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

export function isLabId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
