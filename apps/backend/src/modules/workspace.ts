import {
  CONTRACT_VERSION,
  type AnalysisProposalResponse,
  type ApprovalResponse,
  type EffectResultResponse,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { getCapture } from "./captures.js";

interface WorkspaceCaptureRow {
  id: string;
  subject_id: string;
  subject_label: string;
  assignment_id: string;
  assignment_label: string;
}

interface AnalysisRow {
  id: string;
  disposition: AnalysisProposalResponse["disposition"];
  producer_kind: string;
  producer_name: string;
  producer_version: string;
  created_at: Date;
}

interface AssertionRow {
  id: string;
  field: string;
  proposal_status: string;
  review_status:
    | "pending"
    | "confirmed"
    | "dismissed"
    | "unresolved"
    | "deleted";
  proposed_value: string | null;
  evidence_id: string;
  evidence_quote: string | null;
  subject_kind: string;
  temporal_relation: string;
  supersedes_state_id: string | null;
  version: number;
}

interface ActionRow {
  id: string;
  status: string;
  version: number;
  target_text: string;
  reason_text: string;
  due_text: string;
  evidence_ids: string[];
  required_assertion_ids: string[];
  exact_preview: NonNullable<AnalysisProposalResponse["action"]>["exact_preview"];
  exact_preview_digest: string;
}

interface ConfirmedStateRow {
  id: string;
  field: string;
  value_text: string;
  status: "active" | "superseded" | "contested" | "expired";
  source_assertion_id: string;
  confirmed_by_decision_id: string;
  evidence_id: string;
  source_message_id: string;
  evidence_quote: string | null;
}

interface ApprovalRow {
  id: string;
  action_id: string;
  action_version: number;
  exact_preview_digest: string;
  status: ApprovalResponse["status"];
  approved_by_user_id: string;
  granted_at: Date;
  expires_at: Date;
}

interface EffectRow {
  attempt_id: string;
  action_id: string;
  attempt_status: EffectResultResponse["attempt_status"];
  action_status: string;
  observation_id: string | null;
  destination_key: string | null;
  destination_version: number | null;
  match_status: "matched" | "mismatched" | "unavailable" | null;
  observed_at: Date | null;
  outcome_id: string | null;
  outcome_status: "verified" | "failed" | "unknown" | null;
  outcome_summary: string | null;
  outcome_created_at: Date | null;
}

export async function getWorkspaceReview(
  pool: Pool,
  auth: AuthContext,
  fixtureCaseId: string,
): Promise<WorkspaceReviewResponse> {
  const captureResult = await pool.query<WorkspaceCaptureRow>(
    `SELECT
       captures.id,
       captures.subject_id,
       subjects.display_label AS subject_label,
       captures.assignment_id,
       assignments.display_label AS assignment_label
     FROM captures
     JOIN subjects
       ON subjects.account_id = captures.account_id
      AND subjects.id = captures.subject_id
     JOIN assignments
       ON assignments.account_id = captures.account_id
      AND assignments.id = captures.assignment_id
     WHERE captures.account_id = $1
       AND captures.fixture_case_id = $2
       AND captures.status = 'active'
       AND captures.identity_status = 'bound'
     ORDER BY captures.created_at DESC, captures.id DESC
     LIMIT 1`,
    [auth.accountId, fixtureCaseId],
  );
  const workspaceCapture = captureResult.rows[0];
  if (!workspaceCapture) {
    throw new ApiError(
      404,
      "WORKSPACE_REVIEW_NOT_FOUND",
      "No active review exists for this synthetic case.",
    );
  }
  const capture = await getCapture(pool, auth, workspaceCapture.id);

  const analysisResult = await pool.query<AnalysisRow>(
    `SELECT
       id, disposition, producer_kind, producer_name, producer_version,
       created_at
     FROM analysis_proposals
     WHERE account_id = $1
       AND capture_id = $2
       AND status = 'active'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [auth.accountId, workspaceCapture.id],
  );
  const analysisRow = analysisResult.rows[0];
  if (!analysisRow) {
    throw new ApiError(
      404,
      "WORKSPACE_REVIEW_NOT_FOUND",
      "The capture has no active proposal.",
    );
  }

  const [assertionsResult, actionResult, statesResult, cursorResult] =
    await Promise.all([
      pool.query<AssertionRow>(
        `SELECT
           id, field, proposal_status, review_status, proposed_value,
           evidence_id, evidence_quote, subject_kind, temporal_relation,
           supersedes_state_id, version
         FROM proposed_assertions
         WHERE account_id = $1
           AND analysis_proposal_id = $2
           AND review_status <> 'deleted'
         ORDER BY created_at, id`,
        [auth.accountId, analysisRow.id],
      ),
      pool.query<ActionRow>(
        `SELECT
           id, status, version, target_text, reason_text, due_text,
           evidence_ids, required_assertion_ids, exact_preview,
           exact_preview_digest
         FROM action_proposals
         WHERE account_id = $1
           AND analysis_proposal_id = $2
           AND status <> 'deleted'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [auth.accountId, analysisRow.id],
      ),
      pool.query<ConfirmedStateRow>(
        `SELECT
           states.id,
           states.field,
           states.value_text,
           states.status,
           states.source_assertion_id,
           states.confirmed_by_decision_id,
           assertions.evidence_id,
           evidence.source_message_id,
           assertions.evidence_quote
         FROM confirmed_states states
         JOIN proposed_assertions assertions
           ON assertions.account_id = states.account_id
          AND assertions.id = states.source_assertion_id
         JOIN evidence_items evidence
           ON evidence.account_id = assertions.account_id
          AND evidence.id = assertions.evidence_id
         WHERE states.account_id = $1
           AND states.assignment_id = $2
           AND states.status <> 'deleted'
           AND states.value_text IS NOT NULL
         ORDER BY states.field, states.valid_from, states.id`,
        [auth.accountId, workspaceCapture.assignment_id],
      ),
      pool.query<{ cursor: string }>(
        `SELECT COALESCE(MAX(sequence), 0)::text AS cursor
         FROM audit_events
         WHERE account_id = $1`,
        [auth.accountId],
      ),
    ]);

  const actionRow = actionResult.rows[0];
  const action: AnalysisProposalResponse["action"] = actionRow
    ? {
        id: actionRow.id,
        type: "prepare_question",
        status: actionRow.status,
        version: actionRow.version,
        target: actionRow.target_text,
        reason: actionRow.reason_text,
        due: actionRow.due_text,
        evidence_ids: actionRow.evidence_ids,
        required_assertion_ids: actionRow.required_assertion_ids,
        exact_preview: actionRow.exact_preview,
        exact_preview_digest: actionRow.exact_preview_digest,
        simulated: true,
      }
    : null;

  const analysis: AnalysisProposalResponse = {
    id: analysisRow.id,
    capture_id: workspaceCapture.id,
    disposition: analysisRow.disposition,
    producer: {
      kind: analysisRow.producer_kind,
      name: analysisRow.producer_name,
      version: analysisRow.producer_version,
    },
    assertions: assertionsResult.rows.map((assertion) => ({
      id: assertion.id,
      field: assertion.field,
      status: assertion.proposal_status,
      review_status: assertion.review_status,
      value: assertion.proposed_value,
      evidence_id: assertion.evidence_id,
      evidence_quote: assertion.evidence_quote,
      subject_kind: assertion.subject_kind,
      temporal_relation: assertion.temporal_relation,
      supersedes_state_id: assertion.supersedes_state_id,
      version: assertion.version,
    })),
    action,
    created_at: analysisRow.created_at.toISOString(),
  };

  let latestApproval: ApprovalResponse | null = null;
  let latestEffect: EffectResultResponse | null = null;
  if (actionRow) {
    const approvalResult = await pool.query<ApprovalRow>(
      `SELECT
         id, action_id, action_version, exact_preview_digest, status,
         approved_by_user_id, granted_at, expires_at
       FROM action_approvals
       WHERE account_id = $1 AND action_id = $2
       ORDER BY granted_at DESC, id DESC
       LIMIT 1`,
      [auth.accountId, actionRow.id],
    );
    const approval = approvalResult.rows[0];
    if (approval) {
      latestApproval = {
        id: approval.id,
        action_id: approval.action_id,
        action_version: approval.action_version,
        exact_preview_digest: approval.exact_preview_digest,
        status: approval.status,
        approved_by_user_id: approval.approved_by_user_id,
        granted_at: approval.granted_at.toISOString(),
        expires_at: approval.expires_at.toISOString(),
      };
    }

    const effectResult = await pool.query<EffectRow>(
      `SELECT
         attempts.id AS attempt_id,
         attempts.action_id,
         attempts.status AS attempt_status,
         actions.status AS action_status,
         observations.id AS observation_id,
         observations.destination_key,
         observations.destination_version,
         observations.match_status,
         observations.observed_at,
         outcomes.id AS outcome_id,
         outcomes.status AS outcome_status,
         outcomes.summary AS outcome_summary,
         outcomes.created_at AS outcome_created_at
       FROM effect_attempts attempts
       JOIN action_proposals actions
         ON actions.account_id = attempts.account_id
        AND actions.id = attempts.action_id
       LEFT JOIN effect_observations observations
         ON observations.account_id = attempts.account_id
        AND observations.attempt_id = attempts.id
       LEFT JOIN outcomes
         ON outcomes.account_id = attempts.account_id
        AND outcomes.attempt_id = attempts.id
       WHERE attempts.account_id = $1 AND attempts.action_id = $2
       ORDER BY attempts.attempt_number DESC, attempts.started_at DESC
       LIMIT 1`,
      [auth.accountId, actionRow.id],
    );
    const effect = effectResult.rows[0];
    if (effect) {
      latestEffect = {
        attempt_id: effect.attempt_id,
        action_id: effect.action_id,
        attempt_status: effect.attempt_status,
        action_status: effect.action_status,
        simulated: true,
        reused: false,
        observation:
          effect.observation_id &&
          effect.destination_key &&
          effect.destination_version !== null &&
          effect.match_status &&
          effect.observed_at
            ? {
                id: effect.observation_id,
                destination_key: effect.destination_key,
                destination_version: effect.destination_version,
                match_status: effect.match_status,
                observed_at: effect.observed_at.toISOString(),
              }
            : null,
        outcome:
          effect.outcome_id &&
          effect.outcome_status &&
          effect.outcome_summary &&
          effect.outcome_created_at
            ? {
                id: effect.outcome_id,
                status: effect.outcome_status,
                summary: effect.outcome_summary,
                created_at: effect.outcome_created_at.toISOString(),
              }
            : null,
      };
    }
  }

  const auditCursor = Number.parseInt(cursorResult.rows[0]?.cursor ?? "0", 10);
  return {
    contract_version: CONTRACT_VERSION,
    data_classification: "synthetic_fixture_only",
    account_id: auth.accountId,
    account_slug: auth.accountSlug,
    subject: {
      id: workspaceCapture.subject_id,
      display_label: workspaceCapture.subject_label,
    },
    assignment: {
      id: workspaceCapture.assignment_id,
      display_label: workspaceCapture.assignment_label,
    },
    capture,
    analysis,
    confirmed_state: {
      id: workspaceCapture.assignment_id,
      version: auditCursor,
      assertions: statesResult.rows.map((state) => ({
        id: state.id,
        field: state.field,
        value: state.value_text,
        status: "confirmed",
        state_status: state.status,
        evidence_message_id: state.source_message_id,
        evidence_id: state.evidence_id,
        evidence_quote: state.evidence_quote,
        source_assertion_id: state.source_assertion_id,
        confirmed_by_decision_id: state.confirmed_by_decision_id,
      })),
    },
    latest_approval: latestApproval,
    latest_effect: latestEffect,
    audit_cursor: auditCursor,
  };
}
