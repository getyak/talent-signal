import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";
const obj = { additionalProperties: false };
const id = Type.String({ format: "uuid" });
const nullableText = Type.Union([Type.String(), Type.Null()]);
export const ProductRunSentimentSchema = Type.Union([Type.Literal("helpful"), Type.Literal("unhelpful"), Type.Null()]);
export const ProductRunFeedbackMutationSchema = Type.Object({
  idempotency_key: id, expected_revision: Type.Integer({ minimum: 0 }),
  output_hash: Type.String({ pattern: "^[a-f0-9]{64}$" }), sentiment: ProductRunSentimentSchema,
  reasons: Type.Array(Type.String({ maxLength: 80 }), { maxItems: 6, uniqueItems: true }),
  comment: Type.String({ maxLength: 2000 }), correction: Type.String({ maxLength: 2000 }),
  selected_text: Type.String({ maxLength: 4000 }),
}, obj);
export const ProductRunFeedbackSchema = Type.Object({
  revision: Type.Integer({ minimum: 0 }), sentiment: ProductRunSentimentSchema,
  reasons: Type.Array(Type.String()), comment: Type.String(), correction: Type.String(), selected_text: Type.String(),
  updated_at: nullableText,
}, obj);
export const ProductRunSummarySchema = Type.Object({
  id, task_id: nullableText, session_id: nullableText, platform: Type.String(), task_kind: Type.String(),
  objective: Type.String(), status: Type.String(), created_at: Type.String(), updated_at: Type.String(),
  duration_ms: Type.Union([Type.Number(), Type.Null()]), attempts: Type.Integer(),
  output_hash: nullableText, feedback: ProductRunFeedbackSchema, model: nullableText,
  span_count: Type.Integer(), content_available: Type.Boolean(),
}, obj);
export const ProductRunListSchema = Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION),
  runs: Type.Array(ProductRunSummarySchema), next_cursor: nullableText,
  counts: Type.Object({ all: Type.Integer(), helpful: Type.Integer(), unhelpful: Type.Integer(), unrated: Type.Integer() }, obj),
}, obj);
export type ProductRunFeedbackMutation = Static<typeof ProductRunFeedbackMutationSchema>;
export type ProductRunFeedback = Static<typeof ProductRunFeedbackSchema>;
export type ProductRunSummary = Static<typeof ProductRunSummarySchema>;
export type ProductRunList = Static<typeof ProductRunListSchema>;
export interface ProductRunDetail {
  contract_version: typeof CONTRACT_VERSION; run: ProductRunSummary;
  input: unknown; output: unknown; spans: Array<{ id: string; parent_id: string | null; name: string; kind: string;
    status: string; started_at: string; finished_at: string; input: { status: string; value?: unknown };
    output: { status: string; value?: unknown }; metadata: Record<string, unknown>; error: string | null }>;
  history: Array<ProductRunFeedback & { id: string; output_hash: string; platform: string; output: unknown }>;
  execution: unknown; corrections: unknown[];
}
