import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
  type ResourceCaptureRequest,
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
  const client = new TalentSignalClient(baseUrl);
  const session = await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "source-authorization-expiry-runtime-evaluation",
  });

  const submittedAt = new Date();
  const authorizationExpiresAt = new Date(
    submittedAt.getTime() + 5_000,
  );
  const resourceClientId = `expiry-note-${randomUUID()}`;
  const roleValue =
    `Synthetic authorization proof leader ${randomUUID().slice(0, 8)}`;
  const request: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `expiry-create:${randomUUID()}`,
    channel: "chat",
    purpose: "Synthetic source-authorization expiry proof",
    captured_at: submittedAt.toISOString(),
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label: `Expiry proof ${randomUUID().slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic authorization-expiry context",
        purpose: "Prove automatic evidence invalidation",
      },
      binding_basis:
        "The synthetic recruiter explicitly created this isolated evaluation person.",
    },
    resource: {
      client_resource_id: resourceClientId,
      kind: "contact_record",
      display_name: "Authorization-expiry proof contact record",
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
        client_resource_id: resourceClientId,
        kind: "contact_field",
        sequence: 0,
        text: `Current role: ${roleValue}`,
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
          name: "source-authorization-expiry-evaluation",
          version: "1.0.0",
        },
      },
    ],
  };

  const capture = await client.createResourceCapture(request);
  assert.equal(capture.identity.status, "bound");
  assert(capture.identity.person_id);
  assert(capture.identity.relationship_context_id);

  const personId = capture.identity.person_id;
  const relationshipContextId =
    capture.identity.relationship_context_id;
  let capturedDetail =
    await client.getRelationshipResource(capture.resource.id);
  const fragment = capturedDetail.fragments[0];
  assert(fragment);
  await client.reviewEvidenceFragment(fragment.id, {
    idempotency_key: `expiry-review:${randomUUID()}`,
    expected_review_status: "proposed",
    decision: "reviewed",
    reason:
      "Synthetic recruiter verified this contact field against the governed record.",
  });
  capturedDetail =
    await client.getRelationshipResource(capture.resource.id);
  assert.equal(capturedDetail.claim_proposals.length, 1);
  const claim = capturedDetail.claim_proposals[0];
  assert(claim);
  const confirmation = await client.decideAssertion(claim.id, {
    idempotency_key: `expiry-confirm:${randomUUID()}`,
    expected_assertion_version: claim.version,
    decision: "confirm",
  });
  assert(confirmation.confirmed_state_id);
  const baseline = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `expiry-baseline:${randomUUID()}`,
      objective:
        "Compile the authorized synthetic evidence before its deadline.",
    },
  );
  assert(
    baseline.blocks.some((block) =>
      block.dependencies.some(
        (dependency) =>
          dependency.type === "source_resource" &&
          dependency.id === capture.resource.id,
      ),
    ),
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const waitMs = Math.max(
      0,
      authorizationExpiresAt.getTime() - Date.now() + 100,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const sweepAt = new Date();
    const beforeSweep = await pool.query<{
      authorization_state: string;
    }>(
      `SELECT authorization_state
       FROM source_retention_receipts
       WHERE account_id = $1
         AND capture_id = $2`,
      [session.account.id, capture.capture_id],
    );
    assert.equal(
      beforeSweep.rows[0]?.authorization_state,
      "authorized",
    );
    const useTimeExpiredResource =
      await client.getRelationshipResource(capture.resource.id);
    assert.equal(
      useTimeExpiredResource.resource.source_authorization_state,
      "expired",
    );
    assert.deepEqual(useTimeExpiredResource.fragments, []);
    await assert.rejects(
      client.createChatTask({
        idempotency_key: `expiry-chat-use-time:${randomUUID()}`,
        objective:
          "This task must not use a Wiki whose source authorization deadline elapsed.",
        person_id: personId,
        relationship_context_id: relationshipContextId,
      }),
      (error: unknown) =>
        error instanceof TalentSignalHttpError &&
        error.status === 409 &&
        error.code === "WIKI_SOURCE_AUTHORIZATION_STALE",
    );
    const expirations =
      await sweepAndRecompileDueSourceAuthorizations(
      pool,
      sweepAt,
    );
    const expiration = expirations.find(
      (item) =>
        item.root_capture_id === capture.capture_id,
    );
    assert(expiration);
    assert.equal(expiration.decision, "expire");
    assert.equal(
      expiration.authorization_state,
      "expired",
    );
    assert.equal(expiration.states_retracted, 1);
    assert.equal(expiration.claims_reopened, 1);
    assert(
      expiration.knowledge_snapshots_invalidated.includes(
        baseline.id,
      ),
    );
    assert(expiration.compilation);

    const decision = await pool.query<{
      decided_by_user_id: string | null;
      transition_actor: "human" | "system";
    }>(
      `SELECT decided_by_user_id, transition_actor
       FROM source_authorization_decisions
       WHERE account_id = $1
         AND id = $2`,
      [
        session.account.id,
        expiration.decision_id,
      ],
    );
    assert.equal(decision.rows[0]?.transition_actor, "system");
    assert.equal(decision.rows[0]?.decided_by_user_id, null);

    const audit = await pool.query<{
      actor_user_id: string | null;
    }>(
      `SELECT actor_user_id
       FROM audit_events
       WHERE account_id = $1
         AND event_type = 'source.authorization_expired'
         AND entity_id = $2
       ORDER BY sequence DESC
       LIMIT 1`,
      [session.account.id, capture.capture_id],
    );
    assert.equal(audit.rows[0]?.actor_user_id, null);

    const retractedState = await pool.query<{ status: string }>(
      `SELECT status
       FROM confirmed_states
       WHERE account_id = $1
         AND id = $2`,
      [session.account.id, confirmation.confirmed_state_id],
    );
    assert.equal(retractedState.rows[0]?.status, "retracted");

    const expiredResource =
      await client.getRelationshipResource(capture.resource.id);
    assert.equal(
      expiredResource.resource.source_authorization_state,
      "expired",
    );
    assert.equal(expiredResource.resource.source_locator, null);
    assert.deepEqual(expiredResource.fragments, []);
    assert.deepEqual(expiredResource.claim_proposals, []);

    const rebuiltDependency = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM knowledge_blocks blocks
       JOIN knowledge_dependencies dependencies
         ON dependencies.account_id = blocks.account_id
        AND dependencies.block_id = blocks.id
       WHERE blocks.account_id = $1
         AND blocks.snapshot_id = $2
         AND dependencies.dependency_id = $3`,
      [
        session.account.id,
        expiration.compilation.snapshot_id,
        capture.resource.id,
      ],
    );
    assert.equal(rebuiltDependency.rows[0]?.count, 0);

    const restoredExpiry = new Date(
      Date.now() + 24 * 60 * 60_000,
    );
    const restored =
      await client.decideCaptureSourceAuthorization(
        capture.capture_id,
        {
          idempotency_key: `expiry-restore:${randomUUID()}`,
          expected_capture_version:
            expiration.root_capture_version,
          decision: "restore",
          reason:
            "Synthetic recruiter renewed authorization for this governed purpose.",
          authorization_expires_at:
            restoredExpiry.toISOString(),
        },
      );
    assert.equal(restored.prior_authorization_state, "expired");
    assert.equal(restored.authorization_state, "authorized");
    assert.equal(
      restored.authorization_expires_at,
      restoredExpiry.toISOString(),
    );

    const restoredResource =
      await client.getRelationshipResource(capture.resource.id);
    assert.equal(
      restoredResource.resource.source_authorization_state,
      "authorized",
    );
    assert.equal(restoredResource.fragments.length, 1);
    assert.equal(
      restoredResource.fragments[0]?.review_status,
      "proposed",
    );
    assert.equal(
      restoredResource.claim_proposals[0]?.review_status,
      "pending",
    );

    const beta = new TalentSignalClient(baseUrl);
    await beta.login({
      account_slug: "fixture-beta",
      user_email: "recruiter@beta.local",
      client_label:
        "source-authorization-expiry-cross-account-evaluation",
    });
    await assert.rejects(
      beta.getRelationshipResource(capture.resource.id),
      (error: unknown) =>
        error instanceof TalentSignalHttpError &&
        error.status === 404,
    );

    const renewalSubmittedAt = new Date();
    const renewalDeadline = new Date(
      renewalSubmittedAt.getTime() + 3_000,
    );
    const renewalClientResourceId =
      `expiry-renewal-note-${randomUUID()}`;
    const renewalCapture = await client.createResourceCapture({
      contract_version: CONTRACT_VERSION,
      idempotency_key: `expiry-renewal-create:${randomUUID()}`,
      channel: "chat",
      purpose:
        "Synthetic in-request renewal after use-time expiry",
      captured_at: renewalSubmittedAt.toISOString(),
      source_timezone: "Asia/Singapore",
      person_scope: {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: relationshipContextId,
        },
        binding_basis:
          "The synthetic recruiter explicitly attached this isolated renewal proof to the existing context.",
      },
      resource: {
        client_resource_id: renewalClientResourceId,
        kind: "personal_note",
        display_name: "Inline renewal proof note",
        media_type: "text/plain",
        observed_at: renewalSubmittedAt.toISOString(),
        source_timezone: "Asia/Singapore",
        authorization_expires_at:
          renewalDeadline.toISOString(),
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      fragments: [
        {
          client_resource_id: renewalClientResourceId,
          kind: "note_revision",
          sequence: 0,
          text:
            "Synthetic evidence used only to prove renewal immediately after its deadline.",
          locator: { kind: "note_revision", revision: 1 },
          attribution: {
            actor_kind: "recruiter",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: {
            name: "source-authorization-expiry-evaluation",
            version: "1.0.0",
          },
        },
      ],
    });
    const renewalDetail =
      await client.getRelationshipResource(
        renewalCapture.resource.id,
      );
    const renewalWaitMs = Math.max(
      0,
      renewalDeadline.getTime() - Date.now() + 100,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, renewalWaitMs),
    );
    const inlineRestoredExpiry = new Date(
      Date.now() + 24 * 60 * 60_000,
    );
    const inlineRestored =
      await client.decideCaptureSourceAuthorization(
        renewalCapture.capture_id,
        {
          idempotency_key: `expiry-inline-restore:${randomUUID()}`,
          expected_capture_version:
            renewalDetail.resource.capture_version,
          decision: "restore",
          reason:
            "Synthetic recruiter renewed this source immediately after its deadline.",
          authorization_expires_at:
            inlineRestoredExpiry.toISOString(),
        },
      );
    assert.equal(
      inlineRestored.prior_authorization_state,
      "expired",
    );
    assert.equal(
      inlineRestored.authorization_state,
      "authorized",
    );
    const inlineExpiration = await pool.query<{
      transition_actor: string;
      decided_by_user_id: string | null;
    }>(
      `SELECT transition_actor, decided_by_user_id
       FROM source_authorization_decisions
       WHERE account_id = $1
         AND root_capture_id = $2
         AND decision = 'expire'
       ORDER BY decided_at DESC
       LIMIT 1`,
      [session.account.id, renewalCapture.capture_id],
    );
    assert.equal(
      inlineExpiration.rows[0]?.transition_actor,
      "system",
    );
    assert.equal(
      inlineExpiration.rows[0]?.decided_by_user_id,
      null,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          capture_id: capture.capture_id,
          resource_id: capture.resource.id,
          person_id: personId,
          relationship_context_id: relationshipContextId,
          baseline_snapshot_id: baseline.id,
          expiration_decision_id:
            expiration.decision_id,
          expired_snapshot_id:
            expiration.compilation.snapshot_id,
          restored_snapshot_id:
            restored.compilation?.snapshot_id ?? null,
          authorization_expires_at:
            authorizationExpiresAt.toISOString(),
          restored_authorization_expires_at:
            restored.authorization_expires_at,
          system_actor_proven: true,
          use_time_authorization_enforced_before_sweep: true,
          expired_resource_redacted: true,
          restore_returned_evidence_to_review: true,
          confirmed_state_retracted: true,
          cross_account_resource_denied: true,
          inline_renewal_after_use_time_expiry: true,
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
