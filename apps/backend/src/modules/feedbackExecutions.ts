import { randomUUID } from "node:crypto";
import type { LabJobAttempt, FeedbackSourceState } from "@talent-signal/contracts";
import type { PromptSnapshot } from "@talent-signal/agent/prompt-registry";
import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import type { RemoteChatAnswerRequest, RemoteChatAnswerResult } from "./chatAnswerProvider.js";
import { labHash } from "./labJobCases.js";

export interface FeedbackExecutionSnapshot {
  schema_version: "feedback-execution.v1";
  task: "relationship_text";
  input: Omit<RemoteChatAnswerRequest, "images" | "prompt_snapshot" | "prompt_preset">;
  output: { kind: string; title: string; body: string; citation_ids: string[] };
  attempt: LabJobAttempt;
  prompt_snapshot: PromptSnapshot | null;
  backend_revision: string | null;
  reference_time: string;
  policy_version: string;
}
export interface FeedbackExecutionRow {
  id: string; account_id: string; user_id: string; task_id: string; session_id: string; manifest_id: string;
  person_id: string; relationship_context_id: string; snapshot: FeedbackExecutionSnapshot | null;
  content_hash: string; output_hash: string; source_state: FeedbackSourceState; current_state: FeedbackSourceState;
  created_at: Date; expires_at: Date;
}

/** Capture the original admitted model input; later feedback never reconstructs it from current Wiki state. */
export async function recordFeedbackExecution(client: DatabaseClient, auth: AuthContext, value: {
  task_id: string; session_id?: string; manifest_id: string; person_id: string; relationship_context_id: string;
  input: RemoteChatAnswerRequest; result: RemoteChatAnswerResult; started_at: string; finished_at: string;
  reference_time: string; policy_version: string;
}): Promise<void> {
  // The initial replay adapter is relationship text. Media, noncanonical Sessions,
  // and historical runs report snapshot_unavailable instead of inventing a replay.
  if (!value.session_id || value.input.images?.length) return;
  // createChatTask has acquired and verified the shared completion-source gate.
  const session = (await client.query<{ expires_at: Date }>(
    "SELECT expires_at FROM agent_sessions WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3 AND deleted_at IS NULL AND expires_at>now()",
    [auth.accountId, auth.userId, value.session_id],
  )).rows[0];
  if (!session) return;
  const result = value.result;
  const input: FeedbackExecutionSnapshot["input"] = {
    objective: value.input.objective, context_blocks: structuredClone(value.input.context_blocks),
    ...(value.input.responsePreference ? { responsePreference: structuredClone(value.input.responsePreference) } : {}),
    ...(value.input.calendarContext ? { calendarContext: structuredClone(value.input.calendarContext) } : {}),
    ...(value.input.reference_time ? { reference_time: value.input.reference_time } : {}),
    allowed_citation_ids: [...value.input.allowed_citation_ids],
    ...(value.input.conversation_history ? { conversation_history: structuredClone(value.input.conversation_history) } : {}),
    ...(value.input.permits_unconfirmed_session_context_answer ? { permits_unconfirmed_session_context_answer: true } : {}),
  };
  const id = randomUUID(), caseID = `feedback-${id}`;
  const output = { kind: result.kind, title: result.title, body: result.body, citation_ids: result.citation_ids };
  const attempt: LabJobAttempt = {
    id, ordinal: 0, case_id: caseID, configuration_index: 0, repetition: 1, status: "completed",
    started_at: value.started_at, finished_at: value.finished_at, requested_model: result.model,
    actual_model: Object.hasOwn(result, "reported_model") ? result.reported_model ?? null : result.model,
    prompt_revision: result.prompt_revision ?? "unreported", actual_prompt_revision: result.prompt_revision ?? null,
    execution: "remote", remote_requests_started: result.remote_requests_started === undefined ? 1 : result.remote_requests_started,
    provider_request_id: result.provider_request_id,
    duration_ms: Math.max(0, Date.parse(value.finished_at) - Date.parse(value.started_at)),
    input_tokens: result.usage_reported === false ? null : result.input_tokens,
    output_tokens: result.usage_reported === false ? null : result.output_tokens,
    title: result.title, answer: result.body, citation_ids: result.citation_ids, error_code: null, checks: [],
  };
  const snapshot: FeedbackExecutionSnapshot = {
    schema_version: "feedback-execution.v1", task: "relationship_text", input, output, attempt,
    prompt_snapshot: result.prompt_snapshot ?? null,
    backend_revision: process.env.TALENT_SIGNAL_BACKEND_REVISION?.trim() || null,
    reference_time: value.reference_time, policy_version: value.policy_version,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 200 * 1024) return;
  const expiresAt = new Date(Math.min(session.expires_at.valueOf(), Date.parse(value.reference_time) + 7 * 86400_000));
  await client.query(`INSERT INTO feedback_execution_snapshots(id,account_id,user_id,task_id,session_id,manifest_id,
    person_id,relationship_context_id,snapshot,content_hash,output_hash,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
    ON CONFLICT(account_id,user_id,task_id) DO NOTHING`,
  [id, auth.accountId, auth.userId, value.task_id, value.session_id, value.manifest_id, value.person_id,
    value.relationship_context_id, JSON.stringify(snapshot), labHash(snapshot), labHash(output), value.reference_time, expiresAt]);
}

export async function feedbackExecution(client: DatabaseClient, auth: Pick<AuthContext, "accountId" | "userId">, id: string): Promise<FeedbackExecutionRow | undefined> {
  return (await client.query<FeedbackExecutionRow>(`SELECT *,feedback_execution_source_state(id) AS current_state
    FROM feedback_execution_snapshots WHERE account_id=$1 AND user_id=$2 AND id=$3`, [auth.accountId, auth.userId, id])).rows[0];
}

/** Fence source retraction before deriving content, then read availability in a fresh statement.
 * The sorted lock order also covers a feedback observation's original and later execution.
 */
export async function lockFeedbackExecutions(client: DatabaseClient, auth: Pick<AuthContext, "accountId" | "userId">, ids: string[]): Promise<void> {
  await client.query(`SELECT id FROM feedback_execution_snapshots WHERE account_id=$1 AND user_id=$2
    AND id=ANY($3::uuid[]) ORDER BY id FOR SHARE`, [auth.accountId, auth.userId, ids]);
}
