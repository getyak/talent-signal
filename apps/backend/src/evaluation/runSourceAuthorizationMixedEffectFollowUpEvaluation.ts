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

type SimulationBehavior =
  | "success"
  | "timeout_before_write";

async function provisionEffect(
  recruiter: TalentSignalClient,
  reviewer: TalentSignalClient,
  input: {
    runId: string;
    suffix: string;
    personRef: string;
    contextRef: string;
    authorizationExpiresAt: Date;
    field: "availability" | "decision_deadline";
    value: string;
    message: string;
    behavior: SimulationBehavior;
  },
) {
  const messageId = `mixed-effect-${input.suffix}-${input.runId}`;
  const createRequest: CreateCaptureRequest = {
    idempotency_key:
      `mixed-effect:create:${input.suffix}:${input.runId}`,
    fixture_case_id:
      `MIXED-${input.suffix.toUpperCase()}-${input.runId.slice(0, 8)}`,
    source: {
      kind: "fixture",
      captured_at: new Date().toISOString(),
      source_timezone: "Asia/Singapore",
      purpose:
        "Synthetic mixed external-effect follow-up proof",
      source_locator:
        `synthetic:mixed-effect:${input.suffix}:${input.runId}`,
      authorization_expires_at:
        input.authorizationExpiresAt.toISOString(),
      retention: {
        requested_mode: "full_source",
        source_scope: "full_reviewed_source",
      },
    },
    identity: {
      status: "bound",
      external_ref: input.personRef,
      display_label:
        `Mixed effect ${input.runId.slice(0, 8)}`,
      assignment_ref: input.contextRef,
      assignment_label: "Synthetic mixed-effect search",
      binding_basis:
        "The evaluator explicitly bound both isolated sources to the same synthetic person and context.",
    },
    messages: [
      {
        source_message_id: messageId,
        sequence: 0,
        speaker: "candidate",
        text: input.message,
      },
    ],
  };
  const capture = await recruiter.createCapture(createRequest);
  assert(capture.subject_id);
  assert(capture.assignment_id);

  const analysisRequest: SubmitAnalysisProposalRequest = {
    idempotency_key:
      `mixed-effect:analysis:${input.suffix}:${input.runId}`,
    producer: {
      kind: "fixture_compiler",
      name: "mixed-effect-follow-up-evaluator",
      version: "1.0.0",
    },
    disposition: "propose_action",
    assertions: [
      {
        field: input.field,
        status: "proposed",
        value: input.value,
        evidence_message_id: messageId,
        evidence_quote: input.message,
        subject_kind: "candidate",
        temporal_relation: "new",
      },
    ],
    action: {
      type: "prepare_question",
      owner: "recruiter",
      target:
        `Review ${input.suffix} follow-up for ${input.value}.`,
      reason:
        `Exercise the ${input.behavior} external-effect state before authorization expiry.`,
      due: "before the next candidate conversation",
      evidence_message_ids: [messageId],
      effect_preview: {
        simulated: true,
        capability: SIMULATED_CAPABILITY,
        adapter: "local_deterministic",
        target: {
          destination_key:
            `synthetic:mixed-effect:${input.suffix}:${input.runId}`,
          label: "Local simulated recruiter attention queue",
        },
        change: {
          kind: "create_attention",
          title: `Review ${input.suffix} follow-up`,
        },
        expected_destination_version: 0,
        simulation_behavior: input.behavior,
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
  await recruiter.decideAssertion(assertion.id, {
    idempotency_key:
      `mixed-effect:confirm:${input.suffix}:${input.runId}`,
    expected_assertion_version: assertion.version,
    decision: "confirm",
  });
  const approval = await reviewer.approveAction(action.id, {
    idempotency_key:
      `mixed-effect:approve:${input.suffix}:${input.runId}`,
    expected_action_version: action.version,
    exact_preview: action.exact_preview,
  });
  const effect = await reviewer.executeAction(action.id, {
    idempotency_key:
      `mixed-effect:execute:${input.suffix}:${input.runId}`,
    approval_id: approval.id,
    expected_action_version: approval.action_version,
  });
  return { capture, action, effect };
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const recruiter = new TalentSignalClient(baseUrl);
  await recruiter.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label:
      "source-authorization-mixed-effect-recruiter",
  });
  const reviewer = new TalentSignalClient(baseUrl);
  await reviewer.login({
    account_slug: "fixture-alpha",
    user_email: "reviewer@alpha.local",
    client_label:
      "source-authorization-mixed-effect-reviewer",
  });
  const authorizationExpiresAt = new Date(Date.now() + 8_000);
  const personRef = `synthetic:mixed-effect-person:${runId}`;
  const contextRef = `synthetic:mixed-effect-context:${runId}`;

  const completed = await provisionEffect(recruiter, reviewer, {
    runId,
    suffix: "completed",
    personRef,
    contextRef,
    authorizationExpiresAt,
    field: "availability",
    value: "Tuesday afternoon",
    message:
      "Tuesday afternoon is available for a follow-up conversation.",
    behavior: "success",
  });
  assert.equal(completed.effect.action_status, "completed");
  assert.equal(completed.effect.attempt_status, "verified");
  assert.equal(completed.effect.observation?.match_status, "matched");
  assert.equal(completed.effect.outcome?.status, "verified");

  const unknown = await provisionEffect(recruiter, reviewer, {
    runId,
    suffix: "unknown",
    personRef,
    contextRef,
    authorizationExpiresAt,
    field: "decision_deadline",
    value: "Friday",
    message:
      "Friday is the decision deadline for this synthetic process.",
    behavior: "timeout_before_write",
  });
  assert.equal(
    unknown.capture.subject_id,
    completed.capture.subject_id,
  );
  assert.equal(
    unknown.capture.assignment_id,
    completed.capture.assignment_id,
  );
  assert.equal(unknown.effect.action_status, "unknown");
  assert.equal(unknown.effect.attempt_status, "unknown");
  assert.equal(unknown.effect.observation, null);
  assert.equal(unknown.effect.outcome?.status, "unknown");

  const waitMs = Math.max(
    0,
    authorizationExpiresAt.getTime() - Date.now() + 100,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const expirations =
      await sweepAndRecompileDueSourceAuthorizations(pool);
    const evaluatedCaptureIds = new Set([
      completed.capture.id,
      unknown.capture.id,
    ]);
    const evaluatedExpirations = expirations.filter((expiration) =>
      evaluatedCaptureIds.has(expiration.root_capture_id),
    );
    assert.equal(evaluatedExpirations.length, 2);
    assert(
      evaluatedExpirations.every(
        (expiration) =>
          expiration.external_effects_requiring_follow_up === 1,
      ),
    );

    const history = await recruiter.getRelationshipAgentHistory(
      completed.capture.subject_id as string,
      completed.capture.assignment_id as string,
    );
    const evaluatedFollowUps =
      history.external_effect_follow_ups.filter((followUp) =>
        [completed.action.id, unknown.action.id].includes(
          followUp.action_id,
        ),
      );
    assert.equal(evaluatedFollowUps.length, 2);
    const completedFollowUp = evaluatedFollowUps.find(
      (followUp) =>
        followUp.action_id === completed.action.id,
    );
    const unknownFollowUp = evaluatedFollowUps.find(
      (followUp) => followUp.action_id === unknown.action.id,
    );
    assert(completedFollowUp);
    assert(unknownFollowUp);
    assert.equal(completedFollowUp.action_status, "completed");
    assert.equal(
      completedFollowUp.observation?.match_status,
      "matched",
    );
    assert.equal(
      completedFollowUp.outcome?.status,
      "verified",
    );
    assert.equal(unknownFollowUp.action_status, "unknown");
    assert.equal(unknownFollowUp.attempt?.status, "unknown");
    assert.equal(unknownFollowUp.observation, null);
    assert.equal(unknownFollowUp.outcome?.status, "unknown");
    assert.equal(
      unknownFollowUp.outcome?.summary,
      "The labeled local simulation timed out without destination proof.",
    );
    assert.equal(evaluatedFollowUps[0]?.action_id, unknown.action.id);
    assert(
      evaluatedFollowUps.every(
        (followUp) => followUp.requires_recruiter_decision,
      ),
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          person_id: completed.capture.subject_id,
          relationship_context_id:
            completed.capture.assignment_id,
          authorization_expires_at:
            authorizationExpiresAt.toISOString(),
          completed: {
            capture_id: completed.capture.id,
            action_id: completed.action.id,
            attempt_id: completed.effect.attempt_id,
            observation_id:
              completed.effect.observation?.id ?? null,
            outcome_id: completed.effect.outcome?.id ?? null,
            destination_key:
              completedFollowUp.destination_key,
            projected_status:
              completedFollowUp.action_status,
          },
          unknown: {
            capture_id: unknown.capture.id,
            action_id: unknown.action.id,
            attempt_id: unknown.effect.attempt_id,
            outcome_id: unknown.effect.outcome?.id ?? null,
            destination_key: unknownFollowUp.destination_key,
            projected_status: unknownFollowUp.action_status,
            observation_remains_absent: true,
          },
          one_stable_person_and_context: true,
          two_exact_follow_ups_visible: true,
          unknown_ranked_first: true,
          completed_not_represented_as_undone: true,
          unknown_not_represented_as_failed: true,
          every_follow_up_requires_recruiter_decision: true,
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
      error instanceof Error
        ? error.stack ?? error.message
        : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
