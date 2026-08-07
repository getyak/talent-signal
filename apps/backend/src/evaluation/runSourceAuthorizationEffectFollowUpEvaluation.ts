import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  SIMULATED_CAPABILITY,
  TalentSignalClient,
  type CreateCaptureRequest,
  type SubmitAnalysisProposalRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import { sweepAndRecompileDueSourceAuthorizations } from "../modules/sourceAuthorization.js";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const recruiter = new TalentSignalClient(baseUrl);
  const recruiterSession = await recruiter.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label:
      "source-authorization-effect-follow-up-recruiter",
  });
  const reviewer = new TalentSignalClient(baseUrl);
  await reviewer.login({
    account_slug: "fixture-alpha",
    user_email: "reviewer@alpha.local",
    client_label:
      "source-authorization-effect-follow-up-reviewer",
  });

  const submittedAt = new Date();
  const authorizationExpiresAt = new Date(
    submittedAt.getTime() + 5_000,
  );
  const sourceMessageId = `effect-follow-up-${runId}`;
  const createRequest: CreateCaptureRequest = {
    idempotency_key: `effect-follow-up:create:${runId}`,
    fixture_case_id: `EFFECT-${runId.slice(0, 8)}`,
    source: {
      kind: "fixture",
      captured_at: submittedAt.toISOString(),
      source_timezone: "Asia/Singapore",
      purpose:
        "Synthetic completed-effect follow-up after authorization expiry",
      source_locator: `synthetic:effect-follow-up:${runId}`,
      authorization_expires_at:
        authorizationExpiresAt.toISOString(),
      retention: {
        requested_mode: "full_source",
        source_scope: "full_reviewed_source",
      },
    },
    identity: {
      status: "bound",
      external_ref: `synthetic:effect-person:${runId}`,
      display_label: `Effect follow-up ${runId.slice(0, 8)}`,
      assignment_ref: `synthetic:effect-context:${runId}`,
      assignment_label: "Synthetic completed-effect search",
      binding_basis:
        "The evaluator explicitly bound this isolated source to one synthetic person and context.",
    },
    messages: [
      {
        source_message_id: sourceMessageId,
        sequence: 0,
        speaker: "candidate",
        text: "Tuesday afternoon is available for a follow-up conversation.",
      },
    ],
  };
  const capture = await recruiter.createCapture(createRequest);
  assert(capture.subject_id);
  assert(capture.assignment_id);

  const analysisRequest: SubmitAnalysisProposalRequest = {
    idempotency_key: `effect-follow-up:analysis:${runId}`,
    producer: {
      kind: "fixture_compiler",
      name: "completed-effect-follow-up-evaluator",
      version: "1.0.0",
    },
    disposition: "propose_action",
    assertions: [
      {
        field: "availability",
        status: "proposed",
        value: "Tuesday afternoon",
        evidence_message_id: sourceMessageId,
        evidence_quote:
          "Tuesday afternoon is available for a follow-up conversation.",
        subject_kind: "candidate",
        temporal_relation: "new",
      },
    ],
    action: {
      type: "prepare_question",
      owner: "recruiter",
      target:
        "Prepare the exact Tuesday follow-up question for the candidate.",
      reason:
        "Exercise a completed external effect before authorization expiry.",
      due: "before the next candidate conversation",
      evidence_message_ids: [sourceMessageId],
      effect_preview: {
        simulated: true,
        capability: SIMULATED_CAPABILITY,
        adapter: "local_deterministic",
        target: {
          destination_key:
            `synthetic:effect-follow-up:${runId}`,
          label: "Local simulated recruiter attention queue",
        },
        change: {
          kind: "create_attention",
          title:
            "Prepare the exact Tuesday follow-up question",
        },
        expected_destination_version: 0,
        simulation_behavior: "success",
      },
    },
  };
  const analysis = await recruiter.submitAnalysis(
    capture.id,
    analysisRequest,
  );
  const assertion = analysis.assertions[0];
  const action = analysis.action;
  assert(assertion);
  assert(action);

  const factDecision = await recruiter.decideAssertion(
    assertion.id,
    {
      idempotency_key: `effect-follow-up:confirm:${runId}`,
      expected_assertion_version: assertion.version,
      decision: "confirm",
    },
  );
  assert(factDecision.confirmed_state_id);

  const approval = await reviewer.approveAction(action.id, {
    idempotency_key: `effect-follow-up:approve:${runId}`,
    expected_action_version: action.version,
    exact_preview: action.exact_preview,
  });
  const effect = await reviewer.executeAction(action.id, {
    idempotency_key: `effect-follow-up:execute:${runId}`,
    approval_id: approval.id,
    expected_action_version: approval.action_version,
  });
  assert.equal(effect.attempt_status, "verified");
  assert.equal(effect.action_status, "completed");
  assert.equal(effect.outcome?.status, "verified");

  const baseline = await recruiter.compileKnowledge(
    capture.subject_id,
    capture.assignment_id,
    {
      idempotency_key: `effect-follow-up:wiki:${runId}`,
      objective:
        "Compile the relationship after the simulated effect completed and before authorization expires.",
    },
  );

  const waitMs = Math.max(
    0,
    authorizationExpiresAt.getTime() - Date.now() + 100,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const expirations =
      await sweepAndRecompileDueSourceAuthorizations(pool);
    const expiration = expirations.find(
      (item) => item.root_capture_id === capture.id,
    );
    assert(expiration);
    assert.equal(
      expiration.completed_actions_requiring_follow_up,
      1,
    );
    assert.equal(
      expiration.external_effects_requiring_follow_up,
      1,
    );
    assert(expiration.compilation);
    assert(
      expiration.knowledge_snapshots_invalidated.includes(
        baseline.id,
      ),
    );

    const actionReadback = await pool.query<{
      action_status: string;
      outcome_status: string | null;
      outcome_summary: string | null;
    }>(
      `SELECT
         actions.status AS action_status,
         outcomes.status AS outcome_status,
         outcomes.summary AS outcome_summary
       FROM action_proposals actions
       LEFT JOIN effect_attempts attempts
         ON attempts.account_id = actions.account_id
        AND attempts.action_id = actions.id
       LEFT JOIN outcomes
         ON outcomes.account_id = attempts.account_id
        AND outcomes.attempt_id = attempts.id
       WHERE actions.account_id = $1
         AND actions.id = $2
       ORDER BY outcomes.created_at DESC
       LIMIT 1`,
      [recruiterSession.account.id, action.id],
    );
    assert.equal(
      actionReadback.rows[0]?.action_status,
      "completed",
    );
    assert.equal(
      actionReadback.rows[0]?.outcome_status,
      "verified",
    );

    const history = await recruiter.getRelationshipAgentHistory(
      capture.subject_id,
      capture.assignment_id,
    );
    const expirationOperation = history.operations.find(
      (operation) =>
        operation.provenance.event_type ===
        "source.authorization_expired",
    );
    assert(expirationOperation);
    assert.equal(expirationOperation.actor_kind, "system");
    assert.match(
      expirationOperation.detail,
      /1 external effect requires recruiter follow-up/,
    );
    const exactFollowUp = history.external_effect_follow_ups.find(
      (followUp) => followUp.action_id === action.id,
    );
    assert(exactFollowUp);
    assert.equal(exactFollowUp.action_status, "completed");
    assert.equal(
      exactFollowUp.destination_key,
      action.exact_preview.target.destination_key,
    );
    assert.equal(
      exactFollowUp.attempt?.id,
      effect.attempt_id,
    );
    assert.equal(
      exactFollowUp.observation?.id,
      effect.observation?.id,
    );
    assert.equal(
      exactFollowUp.outcome?.id,
      effect.outcome?.id,
    );
    assert.equal(
      exactFollowUp.authorization.decision_id,
      expiration.decision_id,
    );
    assert.equal(
      exactFollowUp.requires_recruiter_decision,
      true,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          capture_id: capture.id,
          person_id: capture.subject_id,
          relationship_context_id: capture.assignment_id,
          action_id: action.id,
          approval_id: approval.id,
          effect_attempt_id: effect.attempt_id,
          outcome_id: effect.outcome?.id ?? null,
          baseline_snapshot_id: baseline.id,
          expiration_decision_id: expiration.decision_id,
          expired_snapshot_id:
            expiration.compilation.snapshot_id,
          completed_effect_preserved: true,
          future_authority_removed: true,
          recruiter_follow_up_visible_in_agent_history: true,
          exact_follow_up_destination:
            exactFollowUp.destination_key,
          exact_follow_up_attempt_id:
            exactFollowUp.attempt?.id ?? null,
          exact_follow_up_observation_id:
            exactFollowUp.observation?.id ?? null,
          exact_follow_up_outcome_id:
            exactFollowUp.outcome?.id ?? null,
          follow_up_requires_recruiter_decision: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(
    `${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
