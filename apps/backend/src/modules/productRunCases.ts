import type { Pool } from "pg";
import type { LabRegressionSnapshot } from "@talent-signal/contracts";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { labHash } from "./labJobCases.js";
import { LAB_JOB_INSTRUMENT_REVISION } from "./labJobRunner.js";
import type { RemoteChatAnswerRequest, RemoteChatAnswerResult } from "./chatAnswerProvider.js";
import type { ProductRunDetail } from "@talent-signal/contracts";

/** Use the existing Lab case/runner. A thumb supplies a signal, never a gold answer. */
export async function saveProductRunCase(pool: Pool, auth: AuthContext, detail: ProductRunDetail,
  request: { id: string; output_hash: string; expected_behavior: string }) {
  const source = detail.spans.find(span => span.name === "relationship.answer" && span.status === "completed"
    && span.input.status === "complete" && span.output.status === "complete");
  const input = source?.input.value as RemoteChatAnswerRequest | undefined;
  const output = source?.output.value as RemoteChatAnswerResult | undefined;
  if (!source || !input || !output || input.images?.length) throw new ApiError(422, "PRODUCT_RUN_REPLAY_UNAVAILABLE",
    "This run can be exported for review, but its task does not yet have a frozen-input Lab replay adapter.");
  if (!request.expected_behavior.trim()) throw new ApiError(422, "EXPECTED_BEHAVIOR_REQUIRED", "Describe the expected behavior for this case.");
  const { images: _images, observation: _observation, prompt_snapshot: _prompt, prompt_preset: _preset, ...frozen } = input;
  const caseID = `product-${detail.run.id}`;
  const snapshot: LabRegressionSnapshot = {
    schema_version: "lab-regression.v1", data_class: "private_business", task: "relationship_text",
    product_run_source: { run_id: detail.run.id, original_output_hash: request.output_hash,
      feedback_revision: detail.run.feedback.revision, sentiment: detail.run.feedback.sentiment },
    source_job_id: detail.run.task_id!, source_definition_hash: labHash(frozen),
    source_attempt: { id: source.id, ordinal: 0, case_id: caseID, configuration_index: 0, repetition: 1,
      status: "completed", started_at: source.started_at, finished_at: source.finished_at,
      requested_model: output.model, actual_model: output.model, prompt_revision: output.prompt_revision ?? "unreported",
      actual_prompt_revision: output.prompt_revision ?? null, execution: "remote", remote_requests_started: 1,
      provider_request_id: output.provider_request_id, duration_ms: Date.parse(source.finished_at)-Date.parse(source.started_at),
      input_tokens: output.usage_reported === false ? null : output.input_tokens,
      output_tokens: output.usage_reported === false ? null : output.output_tokens,
      title: output.title, answer: output.body, citation_ids: output.citation_ids, error_code: null, checks: [] },
    case: { task: "relationship_text", id: caseID, title: detail.run.objective.slice(0, 160), revision: request.output_hash,
      partition: "development", input_json: JSON.stringify(frozen), input_hash: labHash(frozen), expected: request.expected_behavior.trim() },
    configurations: [{ model: output.model, prompt_preset: "baseline", prompt_revision: output.prompt_revision ?? "unreported",
      ...(output.prompt_snapshot ? { prompt_snapshot: output.prompt_snapshot } : {}) }],
    reference_time: input.reference_time ?? detail.run.created_at, backend_revision: process.env.TALENT_SIGNAL_BACKEND_REVISION ?? null,
    instrument_revision: LAB_JOB_INSTRUMENT_REVISION, failure_categories: ["other"], expected_behavior: request.expected_behavior.trim(),
    review_note: "User-reviewed development expectation from a product run; semantic outcome still requires evaluation.",
    reviewer_id: auth.userId, reviewed_at: new Date().toISOString(),
  };
  await inTransaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
    const run = (await client.query<{ output_hash: string; expires_at: Date; available: boolean }>(
      `SELECT output_hash,expires_at,product_run_source_available(id) AS available FROM product_runs
       WHERE id=$1 AND account_id=$2 AND user_id=$3 FOR SHARE`, [detail.run.id, auth.accountId, auth.userId])).rows[0];
    if (!run?.available || run.output_hash !== request.output_hash) throw new ApiError(409, "PRODUCT_RUN_CHANGED", "Reload the original run before saving a case.");
    const hash = labHash({ run: detail.run.id, request });
    const existing = (await client.query<{ request_hash: string }>("SELECT request_hash FROM lab_regressions WHERE id=$1", [request.id])).rows[0];
    if (existing) {
      if (existing.request_hash !== hash) throw new ApiError(409, "CASE_IDEMPOTENCY_CONFLICT", "This ID belongs to another case.");
      return;
    }
    await client.query(`INSERT INTO lab_regressions(id,account_id,user_id,request_hash,content_hash,snapshot,source_run_id,expires_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, [request.id, auth.accountId, auth.userId, hash, labHash(snapshot),
      JSON.stringify(snapshot), detail.run.id, run.expires_at]);
  });
  return { id: request.id };
}
