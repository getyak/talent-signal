import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import {
  runPendingSourceAuthorizationCompilationJobs,
  sweepDueSourceAuthorizations,
} from "../modules/sourceAuthorization.js";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

async function run(): Promise<void> {
  const client = new TalentSignalClient(baseUrl);
  const session = await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label:
      "source-authorization-restart-recovery-evaluation",
  });
  const submittedAt = new Date();
  const authorizationExpiresAt = new Date(
    submittedAt.getTime() + 3_000,
  );
  const clientResourceId = `restart-proof-${randomUUID()}`;
  const request: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `restart-create:${randomUUID()}`,
    channel: "chat",
    purpose:
      "Synthetic durable source-authorization recovery proof",
    captured_at: submittedAt.toISOString(),
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label:
        `Restart proof ${randomUUID().slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic restart-recovery context",
        purpose:
          "Prove authorization recompilation survives process loss",
      },
      binding_basis:
        "The synthetic recruiter explicitly created this isolated proof person.",
    },
    resource: {
      client_resource_id: clientResourceId,
      kind: "contact_record",
      display_name: "Restart-recovery proof contact record",
      media_type: "text/plain",
      observed_at: submittedAt.toISOString(),
      source_timezone: "Asia/Singapore",
      authorization_expires_at:
        authorizationExpiresAt.toISOString(),
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "contact_field",
        sequence: 0,
        text:
          "Current role: Synthetic restart recovery leader",
        locator: {
          kind: "contact_field",
          field: "current_role",
          source_record_version: "1",
        },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "proposed",
        parser: {
          name:
            "source-authorization-restart-recovery-evaluation",
          version: "1.0.0",
        },
      },
    ],
  };
  const capture = await client.createResourceCapture(request);
  assert(capture.identity.person_id);
  assert(capture.identity.relationship_context_id);
  const detail = await client.getRelationshipResource(
    capture.resource.id,
  );
  const fragment = detail.fragments[0];
  assert(fragment);
  await client.reviewEvidenceFragment(fragment.id, {
    idempotency_key: `restart-review:${randomUUID()}`,
    expected_review_status: "proposed",
    decision: "reviewed",
    reason:
      "Synthetic recruiter verified the contact field for restart recovery.",
  });
  const reviewed = await client.getRelationshipResource(
    capture.resource.id,
  );
  const claim = reviewed.claim_proposals[0];
  assert(claim);
  const confirmation = await client.decideAssertion(claim.id, {
    idempotency_key: `restart-confirm:${randomUUID()}`,
    expected_assertion_version: claim.version,
    decision: "confirm",
  });
  assert(confirmation.confirmed_state_id);
  const baseline = await client.compileKnowledge(
    capture.identity.person_id,
    capture.identity.relationship_context_id,
    {
      idempotency_key: `restart-baseline:${randomUUID()}`,
      objective:
        "Compile the authorized evidence before fault injection.",
    },
  );

  const waitMs = Math.max(
    0,
    authorizationExpiresAt.getTime() - Date.now() + 100,
  );
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const firstProcess = new Pool({ connectionString: databaseUrl });
  let decisionId: string;
  let idempotencyRecordId: string;
  try {
    const expirations = await sweepDueSourceAuthorizations(
      firstProcess,
      new Date(),
    );
    const expiration = expirations.find(
      (item) =>
        item.mutation.body.root_capture_id === capture.capture_id,
    );
    assert(expiration);
    decisionId = expiration.mutation.body.decision_id;
    idempotencyRecordId =
      expiration.mutation.idempotencyRecordId;
    const pending = await firstProcess.query<{
      status: string;
      attempt_count: number;
    }>(
      `SELECT status, attempt_count
       FROM source_authorization_compilation_jobs
       WHERE account_id = $1
         AND decision_id = $2`,
      [session.account.id, decisionId],
    );
    assert.equal(pending.rows[0]?.status, "pending");
    assert.equal(pending.rows[0]?.attempt_count, 0);

    await firstProcess.query(
      `UPDATE source_authorization_compilation_jobs
       SET status = 'running',
           attempt_count = attempt_count + 1,
           lease_owner = 'synthetic-dead-worker',
           lease_expires_at = now() - interval '1 second',
           updated_at = now() - interval '1 second'
       WHERE account_id = $1
         AND decision_id = $2`,
      [session.account.id, decisionId],
    );
  } finally {
    await firstProcess.end();
  }

  const restartedProcess = new Pool({
    connectionString: databaseUrl,
  });
  try {
    const recovered =
      await runPendingSourceAuthorizationCompilationJobs(
        restartedProcess,
        {
          workerId: "synthetic-restarted-worker",
          now: new Date(),
          limit: 10,
        },
      );
    assert.equal(recovered.claimed, 1);
    assert.equal(recovered.completed, 1);
    assert.equal(recovered.retried, 0);

    const completed = await restartedProcess.query<{
      status: string;
      attempt_count: number;
      lease_owner: string | null;
      lease_expires_at: Date | null;
      knowledge_snapshot_id: string | null;
      completed_at: Date | null;
    }>(
      `SELECT
         status,
         attempt_count,
         lease_owner,
         lease_expires_at,
         knowledge_snapshot_id,
         completed_at
       FROM source_authorization_compilation_jobs
       WHERE account_id = $1
         AND decision_id = $2`,
      [session.account.id, decisionId],
    );
    const completedJob = completed.rows[0];
    assert.equal(completedJob?.status, "completed");
    assert.equal(completedJob?.attempt_count, 2);
    assert.equal(completedJob?.lease_owner, null);
    assert.equal(completedJob?.lease_expires_at, null);
    assert(completedJob?.knowledge_snapshot_id);
    assert(completedJob.completed_at);

    const decisionResponse = await restartedProcess.query<{
      response_body: {
        compilation: {
          snapshot_id: string;
        } | null;
        compilation_error: string | null;
      };
    }>(
      `SELECT response_body
       FROM idempotency_records
       WHERE account_id = $1
         AND id = $2`,
      [session.account.id, idempotencyRecordId],
    );
    assert.equal(
      decisionResponse.rows[0]?.response_body.compilation
        ?.snapshot_id,
      completedJob.knowledge_snapshot_id,
    );
    assert.equal(
      decisionResponse.rows[0]?.response_body.compilation_error,
      null,
    );

    const snapshot = await client.getKnowledge(
      capture.identity.person_id,
      capture.identity.relationship_context_id,
    );
    assert.equal(snapshot.id, completedJob.knowledge_snapshot_id);
    assert.notEqual(snapshot.id, baseline.id);
    assert(
      snapshot.blocks.every((block) =>
        block.dependencies.every(
          (dependency) =>
            dependency.id !== capture.resource.id,
        ),
      ),
    );
    const state = await restartedProcess.query<{
      status: string;
    }>(
      `SELECT status
       FROM confirmed_states
       WHERE account_id = $1
         AND id = $2`,
      [session.account.id, confirmation.confirmed_state_id],
    );
    assert.equal(state.rows[0]?.status, "retracted");

    const replay = await runPendingSourceAuthorizationCompilationJobs(
      restartedProcess,
      {
        workerId: "synthetic-second-restart-worker",
        now: new Date(),
        limit: 10,
      },
    );
    assert.deepEqual(replay, {
      claimed: 0,
      completed: 0,
      retried: 0,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          capture_id: capture.capture_id,
          resource_id: capture.resource.id,
          person_id: capture.identity.person_id,
          relationship_context_id:
            capture.identity.relationship_context_id,
          authorization_expires_at:
            authorizationExpiresAt.toISOString(),
          expiration_decision_id: decisionId,
          baseline_snapshot_id: baseline.id,
          recovered_snapshot_id:
            completedJob.knowledge_snapshot_id,
          injected_failure:
            "worker lease expired after durable job claim",
          restarted_worker_claimed_job: true,
          attempt_count: completedJob.attempt_count,
          stale_lease_cleared: true,
          confirmed_state_retracted: true,
          expired_evidence_excluded: true,
          second_restart_was_idempotent: true,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await restartedProcess.end();
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
