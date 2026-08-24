import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4317";

async function main(): Promise<void> {
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "evidence-review-authority-evaluation",
  });

  const runId = randomUUID();
  const clientResourceId = `review-authority:${runId}`;
  const now = new Date().toISOString();
  const capture: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `review-authority:${runId}:capture`,
    channel: "ios_share",
    purpose: "Synthetic atomic evidence-review authority evaluation",
    captured_at: now,
    source_timezone: "Asia/Shanghai",
    person_scope: {
      status: "new_person",
      display_label: `Review Authority ${runId.slice(0, 6)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic authority-cycle review",
        purpose: "Prove stale replay rejection",
        role: "Candidate",
      },
      binding_basis: "Synthetic evaluator-created identity.",
    },
    resource: {
      client_resource_id: clientResourceId,
      kind: "conversation_transcript",
      display_name: "Synthetic authority-cycle source",
      media_type: "text/plain",
      observed_at: now,
      source_timezone: "Asia/Shanghai",
      source_locator: `synthetic:review-authority:${runId}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "message",
        sequence: 0,
        text: "Synthetic reviewed evidence for an authority-cycle replay test.",
        locator: {
          kind: "message",
          source_message_id: `review-authority-${runId}`,
          sequence: 0,
          speaker_side: "left",
        },
        attribution: { actor_kind: "candidate", status: "confirmed" },
        review_status: "proposed",
        parser: { name: "synthetic-authority-evaluator", version: "1.0.0" },
      },
    ],
  };

  const created = await client.createResourceCapture(capture);
  const detail = await client.getRelationshipResource(created.resource.id);
  const fragment = detail.fragments[0];
  assert(fragment, "The synthetic fragment must exist.");

  const initial = await client.reviewEvidenceFragment(fragment.id, {
    idempotency_key: `review-authority:${runId}:initial`,
    expected_review_status: "proposed",
    expected_last_review_id: null,
    decision: "reviewed",
    reason: "The evaluator compared the exact synthetic source.",
  });
  assert.equal(initial.prior_review_id, null);

  const rejectRequest = {
    idempotency_key: `review-authority:${runId}:reject`,
    expected_review_status: "reviewed" as const,
    expected_last_review_id: initial.review_id,
    decision: "rejected" as const,
    reason: "The excerpt needs correction.",
  };
  const rejected = await client.reviewEvidenceFragment(
    fragment.id,
    rejectRequest,
  );
  const sameCycleReplay = await client.reviewEvidenceFragment(
    fragment.id,
    rejectRequest,
  );
  assert.equal(sameCycleReplay.review_id, rejected.review_id);
  assert.equal(sameCycleReplay.prior_review_id, initial.review_id);

  const reviewedAgain = await client.reviewEvidenceFragment(fragment.id, {
    idempotency_key: `review-authority:${runId}:review-again`,
    expected_review_status: "rejected",
    expected_last_review_id: rejected.review_id,
    decision: "reviewed",
    reason: "The corrected source was checked again.",
  });
  assert.equal(reviewedAgain.prior_review_id, rejected.review_id);

  let staleReplayRejected = false;
  try {
    await client.reviewEvidenceFragment(fragment.id, rejectRequest);
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "EVIDENCE_REVIEW_AUTHORITY_STALE");
    staleReplayRejected = true;
  }
  assert.equal(staleReplayRejected, true);

  const finalDetail = await client.getRelationshipResource(created.resource.id);
  assert.equal(finalDetail.fragments[0]?.review_status, "reviewed");

  let persistedAuthorityChainVerified = false;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const chain = await pool.query<{
        id: string;
        prior_review_id: string | null;
        review_revision: number;
      }>(
        `SELECT id, prior_review_id, review_revision
         FROM evidence_fragment_reviews
         WHERE fragment_id = $1
         ORDER BY review_revision`,
        [fragment.id],
      );
      assert.deepEqual(
        chain.rows.map((row) => Number(row.review_revision)),
        [1, 2, 3],
      );
      assert.deepEqual(
        chain.rows.map((row) => row.prior_review_id),
        [null, initial.review_id, rejected.review_id],
      );
      assert.deepEqual(
        chain.rows.map((row) => row.id),
        [initial.review_id, rejected.review_id, reviewedAgain.review_id],
      );
      persistedAuthorityChainVerified = true;
    } finally {
      await pool.end();
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      evaluation: "evidence_review_authority",
      same_cycle_replay_review_id: sameCycleReplay.review_id,
      later_review_id: reviewedAgain.review_id,
      stale_replay_rejected: staleReplayRejected,
      final_review_status: finalDetail.fragments[0]?.review_status,
      persisted_authority_chain_verified: persistedAuthorityChainVerified,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Evidence review authority evaluation failed: ${
      error instanceof Error ? error.stack ?? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
