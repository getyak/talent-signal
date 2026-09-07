import { randomUUID } from "node:crypto";
import { Value } from "@sinclair/typebox/value";
import {
  FeedbackMutationSchema, FeedbackObservationRequestSchema,
  type AgentSessionPayload, type FeedbackMutation, type FeedbackRecord, type FeedbackSource,
  type FeedbackCategory, type FeedbackObservation, type FeedbackObservationRequest, type LabRegressionSnapshot,
  type LabFailureCategory,
} from "@talent-signal/contracts";
import type { Pool } from "pg";
import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { sweepRuntimeObservationSources } from "./runtimeObservationLifecycle.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { feedbackExecution, lockFeedbackExecutions, type FeedbackExecutionRow } from "./feedbackExecutions.js";
import { labHash } from "./labJobCases.js";
import { LAB_JOB_INSTRUMENT_REVISION } from "./labJobRunner.js";

interface FeedbackRow {
  id: string; account_id: string; user_id: string; session_id: string; turn_id: string; execution_id: string;
  revision: number; category: FeedbackCategory; status: "active" | "withdrawn"; expected_behavior_proposal: string | null;
  regression_id: string | null; created_at: Date; updated_at: Date; expires_at: Date;
}
interface SessionRow { revision: number; payload: AgentSessionPayload | null; expires_at: Date; deleted_at: Date | null }
const scoped = (auth: AuthContext, id: string) => [auth.accountId, auth.userId, id];
const issueKinds: Partial<Record<FeedbackCategory, { category: LabFailureCategory; expected: string }>> = {
  fact_error: { category: "unsupported_claim", expected: "Use only the frozen evidence for factual claims; retain unsupported details as unknown." },
  wrong_identity: { category: "wrong_identity", expected: "Keep distinct identities separate and ask for clarification when identity evidence is ambiguous." },
  wrong_time: { category: "stale_evidence", expected: "Preserve source order, reference time, timezone and supersession; do not present an obsolete time as current." },
  unsupported_suggestion: { category: "unsafe_action", expected: "Propose only evidence-supported next steps; preserve no_action and require human authority for consequential effects." },
};
function requireHuman(auth: AuthContext): void {
  if (!["apple_human", "google_human", "password_human", "simulated_human", "lab_human"].includes(auth.userKind))
    throw new ApiError(403, "FEEDBACK_HUMAN_REQUIRED", "A signed-in human must own feedback and observations.");
}
function unavailable(): never { throw new ApiError(404, "FEEDBACK_SOURCE_NOT_FOUND", "This feedback source is unavailable in your account and owner scope."); }
function intact(execution: FeedbackExecutionRow): boolean {
  return execution.current_state === "available" && execution.snapshot !== null
    && labHash(execution.snapshot) === execution.content_hash && labHash(execution.snapshot.output) === execution.output_hash;
}
async function lockOwner(client: DatabaseClient, auth: AuthContext) {
  // Use the same lock as Lab creation/deletion so a withdrawal fences rerun admission.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
}
async function sessionTurn(client: DatabaseClient, auth: AuthContext, sessionID: string, turnID: string, lock = false) {
  const session = (await client.query<SessionRow>(`SELECT revision,payload,expires_at,deleted_at FROM agent_sessions
    WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3 ${lock ? "FOR SHARE" : ""}`, scoped(auth, sessionID))).rows[0];
  if (!session) unavailable();
  if (!session.payload || session.deleted_at || session.expires_at.valueOf() <= Date.now())
    throw new ApiError(410, "FEEDBACK_SESSION_GONE", "This Session was deleted or expired.");
  const turn = session.payload.turns.find((value) => value.id.toLowerCase() === turnID.toLowerCase());
  if (!turn) unavailable();
  return { session, turn };
}

export function observationAssessment(request: Pick<FeedbackObservationRequest, "window_start" | "window_end" | "observed_at" | "outcome">,
  now: string, sourcesAvailable: boolean): FeedbackObservation["assessment"] {
  const start = Date.parse(request.window_start), end = Date.parse(request.window_end), clock = Date.parse(now);
  const observed = request.observed_at ? Date.parse(request.observed_at) : NaN;
  if (!sourcesAvailable || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(clock)
    || start >= end || clock < end || !Number.isFinite(observed) || observed < start || observed > end || observed > clock)
    return "unknown";
  return request.outcome === "same_issue" ? "issue_observed"
    : request.outcome === "no_issue_observed" ? "no_issue_observed_in_window" : "unknown";
}

/** Create a development proposal with the same frozen-input adapter as an ordinary Lab rerun. */
async function deriveRegression(client: DatabaseClient, auth: AuthContext, feedback: FeedbackRow, execution: FeedbackExecutionRow): Promise<string | null> {
  const issue = issueKinds[feedback.category];
  if (!issue || !intact(execution)) return null;
  const frozen = execution.snapshot!;
  const id = randomUUID();
  const snapshot: LabRegressionSnapshot = {
    schema_version: "lab-regression.v1", data_class: "private_business", task: frozen.task,
    source_job_id: execution.task_id, source_definition_hash: execution.content_hash, source_attempt: frozen.attempt,
    case: { task: frozen.task, id: frozen.attempt.case_id, title: "Feedback development case", revision: execution.content_hash,
      partition: "development", input_json: JSON.stringify(frozen.input), input_hash: labHash(frozen.input),
      expected: feedback.expected_behavior_proposal?.trim() || issue.expected },
    configurations: [{ model: frozen.attempt.requested_model, prompt_preset: "baseline", prompt_revision: frozen.attempt.prompt_revision,
      ...(frozen.prompt_snapshot ? { prompt_snapshot: frozen.prompt_snapshot } : {}) }],
    reference_time: frozen.reference_time, backend_revision: frozen.backend_revision,
    instrument_revision: LAB_JOB_INSTRUMENT_REVISION, failure_categories: [issue.category],
    expected_behavior: feedback.expected_behavior_proposal?.trim() || issue.expected, review_note: "Feedback-derived expectation proposal; requires independent semantic adjudication.",
    reviewer_id: auth.userId, reviewed_at: feedback.updated_at.toISOString(),
    feedback_source: { feedback_id: feedback.id, feedback_revision: feedback.revision, execution_id: execution.id, session_id: execution.session_id,
      original_task_id: execution.task_id, original_output_hash: execution.output_hash,
      expectation_authority: "proposal", execution_authority: "none" },
  };
  await client.query(`INSERT INTO lab_regressions(id,account_id,user_id,request_hash,content_hash,snapshot,expires_at,source_execution_id,source_feedback_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`, [id, auth.accountId, auth.userId,
    labHash({ feedback: feedback.id, revision: feedback.revision, execution: execution.id }), labHash(snapshot), JSON.stringify(snapshot),
    new Date(Math.min(feedback.expires_at.valueOf(), execution.expires_at.valueOf())), execution.id, feedback.id]);
  return id;
}

export class FeedbackService {
  constructor(readonly pool: Pool) {}
  async list(auth: AuthContext, sessionID: string, turnID: string): Promise<FeedbackRecord[]> {
    const result = await this.pool.query<{ id: string }>(`SELECT id FROM product_feedback
      WHERE account_id=$1 AND user_id=$2 AND session_id=$3 AND turn_id=$4 ORDER BY created_at DESC LIMIT 50`,
    [auth.accountId, auth.userId, sessionID, turnID]);
    return Promise.all(result.rows.map((row) => this.read(auth, row.id)));
  }
  async source(auth: AuthContext, sessionID: string, turnID: string): Promise<FeedbackSource> {
    const { session, turn } = await sessionTurn(this.pool, auth, sessionID, turnID);
    const execution = (await this.pool.query<FeedbackExecutionRow>(`SELECT *,feedback_execution_source_state(id) AS current_state
      FROM feedback_execution_snapshots WHERE account_id=$1 AND user_id=$2 AND session_id=$3 AND task_id=$4`,
    [...scoped(auth, sessionID), turn.response.taskID])).rows[0];
    const available = execution && intact(execution);
    return { session_id: sessionID, turn_id: turnID, session_revision: session.revision, task_id: turn.response.taskID,
      execution_id: execution?.id ?? null, output_hash: execution?.output_hash ?? null,
      source_state: available ? "available" : execution ? execution.current_state === "available" ? "source_unavailable" : execution.current_state : "snapshot_unavailable",
      reference_time: available ? execution.snapshot!.reference_time : null,
      model: available ? execution.snapshot!.attempt.actual_model : null,
      prompt_revision: available ? execution.snapshot!.attempt.actual_prompt_revision : null,
      backend_revision: available ? execution.snapshot!.backend_revision : null,
      legacy_feedback: turn.feedback ?? null };
  }
  async read(auth: AuthContext, id: string): Promise<FeedbackRecord> {
    const row = (await this.pool.query<FeedbackRow & { available_regression_id: string | null }>(`SELECT f.*,r.id AS available_regression_id
      FROM product_feedback f LEFT JOIN lab_regressions r ON r.id=f.regression_id
        AND r.account_id=f.account_id AND r.user_id=f.user_id AND r.source_feedback_id=f.id
        AND r.source_execution_id=f.execution_id AND r.deleted_at IS NULL AND r.expires_at>now() AND r.snapshot IS NOT NULL
        AND r.snapshot->'feedback_source'->>'feedback_id'=f.id::text
        AND r.snapshot->'feedback_source'->>'feedback_revision'=f.revision::text
      WHERE f.account_id=$1 AND f.user_id=$2 AND f.id=$3`, scoped(auth, id))).rows[0];
    if (!row) unavailable();
    const execution = await feedbackExecution(this.pool, auth, row.execution_id);
    if (!execution) unavailable();
    const available = intact(execution);
    return { id: row.id, revision: row.revision, actor_id: row.user_id, session_id: row.session_id, turn_id: row.turn_id,
      execution_id: row.execution_id, task_id: execution.task_id, output_hash: execution.output_hash,
      source_state: available ? "available" : execution.current_state === "available" ? "source_unavailable" : execution.current_state,
      category: row.category, status: row.status, expected_behavior_proposal: available && row.status === "active" ? row.expected_behavior_proposal : null,
      adjudication: "proposed", regression_id: available && row.status === "active" ? row.available_regression_id : null,
      created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(), expires_at: row.expires_at.toISOString() };
  }
  async mutate(auth: AuthContext, id: string, request: FeedbackMutation): Promise<FeedbackRecord> {
    requireHuman(auth);
    if (!Value.Check(FeedbackMutationSchema, request)) throw new ApiError(422, "FEEDBACK_INVALID", "Feedback must match the bounded typed contract.");
    const hash = labHash({ id: id.toLowerCase(), request });
    await inTransaction(this.pool, async (client) => {
      await lockOwner(client, auth);
      const prior = (await client.query<FeedbackRow>("SELECT * FROM product_feedback WHERE account_id=$1 AND user_id=$2 AND id=$3", scoped(auth, id))).rows[0];
      const operation = (await client.query<{ request_hash: string; feedback_id: string }>(
        "SELECT request_hash,feedback_id FROM product_feedback_operations WHERE account_id=$1 AND user_id=$2 AND idempotency_key=$3", scoped(auth, request.idempotency_key))).rows[0];
      if (operation) {
        if (operation.request_hash !== hash || operation.feedback_id !== id.toLowerCase()) throw new ApiError(409, "FEEDBACK_IDEMPOTENCY_CONFLICT", "This operation key identifies a different feedback intent.");
        return;
      }
      if ((prior?.revision ?? 0) !== request.expected_revision) throw new ApiError(409, "FEEDBACK_REVISION_CONFLICT", "Reload the current feedback revision before changing it.");
      if (prior && (prior.execution_id !== request.execution_id.toLowerCase() || prior.session_id !== request.session_id.toLowerCase() || prior.turn_id !== request.turn_id.toLowerCase()))
        throw new ApiError(409, "FEEDBACK_SOURCE_CONFLICT", "Feedback cannot be rebound to a different original output.");
      // Session deletion holds its row before invalidating executions: keep that lock order here.
      const ownedTurn = request.operation === "submit"
        ? await sessionTurn(client, auth, request.session_id, request.turn_id, true) : null;
      await lockFeedbackExecutions(client, auth, [request.execution_id]);
      const execution = await feedbackExecution(client, auth, request.execution_id);
      if (!execution || execution.session_id !== request.session_id.toLowerCase() || execution.output_hash !== request.output_hash) unavailable();
      if (request.operation === "submit") {
        const { session, turn } = ownedTurn!;
        if (session.revision !== request.expected_session_revision) throw new ApiError(409, "FEEDBACK_SESSION_CHANGED", "Reload the Session before submitting feedback for its output.");
        if (turn.response.taskID.toLowerCase() !== execution.task_id
          || session.payload!.personID?.toLowerCase() !== execution.person_id
          || session.payload!.relationshipContextID?.toLowerCase() !== execution.relationship_context_id) unavailable();
        if (!intact(execution)) throw new ApiError(410, "FEEDBACK_SOURCE_GONE", "The original execution is deleted, expired, changed, or no longer authorized.");
      } else if (!prior) throw new ApiError(409, "FEEDBACK_NOT_SUBMITTED", "Only existing feedback can be withdrawn.");
      const row = (await client.query<FeedbackRow>(`INSERT INTO product_feedback(id,account_id,user_id,session_id,turn_id,execution_id,
        revision,category,status,expected_behavior_proposal,expires_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10)
        ON CONFLICT(id) DO UPDATE SET revision=product_feedback.revision+1,category=$7,status=$8,
          expected_behavior_proposal=$9,regression_id=NULL,updated_at=now()
        WHERE product_feedback.account_id=$2 AND product_feedback.user_id=$3 RETURNING *`,
      [id, auth.accountId, auth.userId, request.session_id, request.turn_id, request.execution_id, request.category,
        request.operation === "withdraw" ? "withdrawn" : "active", request.operation === "withdraw" ? null : request.expected_behavior_proposal.trim(), execution.expires_at])).rows[0];
      if (!row) throw new ApiError(409, "FEEDBACK_ID_CONFLICT", "This feedback identifier is already in use.");
      await client.query("SELECT retract_feedback_learning($1)", [auth.accountId]);
      if (row.status === "active") {
        const regression = await deriveRegression(client, auth, row, execution);
        if (regression) await client.query("UPDATE product_feedback SET regression_id=$2 WHERE id=$1", [id, regression]);
      }
      await client.query(`INSERT INTO product_feedback_operations(account_id,user_id,idempotency_key,feedback_id,request_hash,resulting_revision)
        VALUES($1,$2,$3,$4,$5,$6)`, [auth.accountId, auth.userId, request.idempotency_key, id, hash, row.revision]);
    });
    return this.read(auth, id);
  }
  async observe(auth: AuthContext, feedbackID: string, request: FeedbackObservationRequest): Promise<FeedbackObservation> {
    requireHuman(auth);
    if (!Value.Check(FeedbackObservationRequestSchema, request)) throw new ApiError(422, "FEEDBACK_OBSERVATION_INVALID", "The observation must match its typed contract.");
    const hash = labHash({ feedbackID, request });
    const id = await inTransaction(this.pool, async (client) => {
      await lockOwner(client, auth);
      const row = (await client.query<FeedbackRow>("SELECT * FROM product_feedback WHERE account_id=$1 AND user_id=$2 AND id=$3", scoped(auth, feedbackID))).rows[0];
      if (!row) unavailable();
      const prior = (await client.query<{ id: string; request_hash: string }>(`SELECT id,request_hash FROM product_feedback_observations
        WHERE account_id=$1 AND user_id=$2 AND (id=$3 OR idempotency_key=$4)`, [...scoped(auth, request.id), request.idempotency_key])).rows;
      if (prior.length) {
        if (prior.length !== 1 || prior[0]!.request_hash !== hash) throw new ApiError(409, "FEEDBACK_OBSERVATION_CONFLICT", "This observation identifier belongs to a different intent.");
        return prior[0]!.id;
      }
      if (row.revision !== request.expected_feedback_revision || row.status !== "active")
        throw new ApiError(409, "FEEDBACK_REVISION_CONFLICT", "Observe an active, current feedback revision.");
      await lockFeedbackExecutions(client, auth, [row.execution_id, request.later_execution_id]);
      const original = await feedbackExecution(client, auth, row.execution_id), later = await feedbackExecution(client, auth, request.later_execution_id);
      if (!original || !later) unavailable();
      if (!intact(original) || !intact(later)) throw new ApiError(410, "FEEDBACK_SOURCE_GONE", "Both original and later exposure must still be available.");
      if (later.output_hash !== request.later_output_hash || later.id === original.id || later.created_at <= original.created_at
        || later.person_id !== original.person_id || later.relationship_context_id !== original.relationship_context_id)
        throw new ApiError(409, "FEEDBACK_EXPOSURE_MISMATCH", "The later exposure must be a new canonical task in the same relationship scope.");
      const old = original.snapshot!, next = later.snapshot!;
      if (!old.attempt.actual_prompt_revision || !next.attempt.actual_prompt_revision || !old.backend_revision || !next.backend_revision)
        throw new ApiError(409, "FEEDBACK_VERSION_UNAVAILABLE", "Both exposures need recorded prompt and application versions.");
      if (old.attempt.actual_prompt_revision === next.attempt.actual_prompt_revision && old.backend_revision === next.backend_revision)
        throw new ApiError(409, "FEEDBACK_LATER_VERSION_REQUIRED", "A post-release observation requires a changed recorded prompt or application version.");
      const start = Date.parse(request.window_start), end = Date.parse(request.window_end), now = new Date();
      if (start > now.valueOf() || start < later.created_at.valueOf() || end <= start || end - start > 7 * 86400_000
        || (request.observed_at && Date.parse(request.observed_at) > now.valueOf()))
        throw new ApiError(422, "FEEDBACK_WINDOW_INVALID", "Use a bounded observation window beginning at or after the later exposure.");
      const duplicate = (await client.query<{ id: string }>(`SELECT id FROM product_feedback_observations
        WHERE feedback_id=$1 AND feedback_revision=$2 AND later_execution_id=$3`, [row.id, row.revision, later.id])).rows[0];
      if (duplicate) throw new ApiError(409, "FEEDBACK_EXPOSURE_ALREADY_OBSERVED", "This feedback revision and later exposure already have an observation.");
      const assessment = observationAssessment(request, now.toISOString(), true);
      const followup = assessment === "issue_observed" ? await deriveRegression(client, auth, row, later) : null;
      const observation: FeedbackObservation = {
        id: request.id, feedback_id: row.id, feedback_revision: row.revision, actor_id: auth.userId,
        original_execution_id: original.id, later_execution_id: later.id, later_task_id: later.task_id, later_output_hash: later.output_hash,
        original_prompt_revision: old.attempt.actual_prompt_revision, later_prompt_revision: next.attempt.actual_prompt_revision,
        original_backend_revision: old.backend_revision, later_backend_revision: next.backend_revision,
        window_start: request.window_start, window_end: request.window_end, observed_at: request.observed_at,
        reported_outcome: request.outcome, assessment, source_state: "available", followup_regression_id: followup,
        causal_claim: "none", adjudication: "owner_observation", created_at: now.toISOString(),
      };
      const inserted = await client.query(`INSERT INTO product_feedback_observations(id,account_id,user_id,feedback_id,feedback_revision,
        original_execution_id,later_execution_id,idempotency_key,request_hash,record,followup_regression_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [request.id, auth.accountId, auth.userId, row.id, row.revision, original.id, later.id, request.idempotency_key, hash, JSON.stringify(observation), followup]);
      if (!inserted.rows[0]) throw new ApiError(409, "FEEDBACK_OBSERVATION_CONFLICT", "This observation identifier is already in use.");
      return request.id;
    });
    return this.readObservation(auth, feedbackID, id);
  }
  async readObservation(auth: AuthContext, feedbackID: string, id: string): Promise<FeedbackObservation> {
    const row = (await this.pool.query<{ record: FeedbackObservation; original_state: FeedbackSource["source_state"]; later_state: FeedbackSource["source_state"]; feedback_current: boolean; available_regression_id: string | null }>(
      `SELECT o.record,feedback_execution_source_state(o.original_execution_id) AS original_state,
        feedback_execution_source_state(o.later_execution_id) AS later_state,(f.revision=o.feedback_revision AND f.status='active') AS feedback_current,
        r.id AS available_regression_id
        FROM product_feedback_observations o JOIN product_feedback f ON f.id=o.feedback_id
        LEFT JOIN lab_regressions r ON r.id=o.followup_regression_id AND r.account_id=o.account_id AND r.user_id=o.user_id
          AND r.source_feedback_id=f.id AND r.source_execution_id=o.later_execution_id
          AND r.deleted_at IS NULL AND r.expires_at>now() AND r.snapshot IS NOT NULL
          AND r.snapshot->'feedback_source'->>'feedback_id'=f.id::text
          AND r.snapshot->'feedback_source'->>'feedback_revision'=o.feedback_revision::text
        WHERE o.account_id=$1 AND o.user_id=$2 AND o.id=$3 AND o.feedback_id=$4`, [...scoped(auth, id), feedbackID])).rows[0];
    if (!row) unavailable();
    const state = row.original_state !== "available" ? row.original_state : row.later_state;
    const available = state === "available" && row.feedback_current;
    return { ...row.record, source_state: state, assessment: available ? row.record.assessment : "unknown",
      followup_regression_id: available ? row.available_regression_id : null };
  }
  async sweep(): Promise<void> {
    const accounts = (await this.pool.query<{ account_id: string }>(`SELECT DISTINCT account_id FROM feedback_execution_snapshots
      WHERE snapshot IS NOT NULL AND feedback_execution_source_state(id)<>'available' LIMIT 100`)).rows;
    for (const { account_id } of accounts) await this.pool.query("SELECT retract_feedback_learning($1)", [account_id]);
    await sweepRuntimeObservationSources(this.pool);
  }
}
