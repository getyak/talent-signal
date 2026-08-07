import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";

function request(
  runId: string,
  suffix: string,
  personScope: ResourceCaptureRequest["person_scope"],
  text: string,
): ResourceCaptureRequest {
  const clientResourceId = `identity:${runId}:${suffix}`;
  const timestamp = new Date().toISOString();
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `identity:${runId}:${suffix}`,
    channel: "chat",
    purpose: "Synthetic explicit identity-resolution proof",
    captured_at: timestamp,
    source_timezone: "Asia/Singapore",
    person_scope: personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: "document",
      display_name: `${suffix}.txt`,
      media_type: "text/plain",
      observed_at: timestamp,
      source_timezone: "Asia/Singapore",
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_extracted_text",
      },
    },
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "document_text",
        sequence: 0,
        text,
        locator: { kind: "document_text", paragraph: 1 },
        attribution: {
          actor_kind: "document_author",
          status: "proposed",
        },
        review_status: "proposed",
        parser: { name: "utf8-text", version: "1.0.0" },
      },
    ],
  };
}

async function expectConflict(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.status, 409);
    assert.equal(error.code, expectedCode);
    return;
  }
  throw new Error(`Expected ${expectedCode}.`);
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "identity-resolution-runtime-evaluation",
  });

  const anchorClientId = `identity:${runId}:anchor`;
  const timestamp = new Date().toISOString();
  const anchor = await client.createResourceCapture({
    contract_version: CONTRACT_VERSION,
    idempotency_key: `identity:${runId}:anchor`,
    channel: "chat",
    purpose: "Create the explicit existing-person target",
    captured_at: timestamp,
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label: `Identity anchor ${runId.slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Existing relationship context",
        purpose: "Synthetic identity adjudication target",
      },
      binding_basis:
        "The synthetic recruiter explicitly created the anchor person.",
    },
    resource: {
      client_resource_id: anchorClientId,
      kind: "personal_note",
      display_name: "Identity anchor note",
      media_type: "text/plain",
      observed_at: timestamp,
      source_timezone: "Asia/Singapore",
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: anchorClientId,
        kind: "note_revision",
        sequence: 0,
        text: "Synthetic anchor only.",
        locator: { kind: "note_revision", revision: 1 },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: { name: "direct-note-input", version: "1.0.0" },
      },
    ],
  });
  assert(anchor.identity.person_id);
  assert(anchor.identity.relationship_context_id);
  const anchorPersonId = anchor.identity.person_id;
  const anchorContextId = anchor.identity.relationship_context_id;

  const proposed = await client.createResourceCapture(
    request(
      runId,
      "proposed-existing",
      {
        status: "proposed",
        candidate_person_id: anchorPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: anchorContextId,
        },
        match_reasons: ["Synthetic confirmed-handle match."],
        reason:
          "One candidate matched, but the recruiter must decide.",
      },
      "Evidence must remain out of the person Wiki until identity is bound.",
    ),
  );
  assert(proposed.identity.resolution_case_id);
  const proposedCaseId = proposed.identity.resolution_case_id;
  const proposedCase = await client.getIdentityResolutionCase(
    proposedCaseId,
  );
  assert.equal(proposedCase.status, "pending");
  assert.equal(proposedCase.candidates.length, 1);
  assert.equal(
    proposedCase.candidates[0]?.person_id,
    anchorPersonId,
  );

  await expectConflict(
    () =>
      client.decideIdentityResolutionCase(proposedCaseId, {
        idempotency_key: `identity:${runId}:stale`,
        expected_case_version: 999,
        decision: "leave_unresolved",
        reason: "Synthetic stale decision.",
      }),
    "IDENTITY_RESOLUTION_CASE_STALE",
  );
  const deferred = await client.decideIdentityResolutionCase(
    proposedCaseId,
    {
      idempotency_key: `identity:${runId}:defer`,
      expected_case_version: proposedCase.version,
      decision: "leave_unresolved",
      reason: "The recruiter wants more identity evidence first.",
    },
  );
  assert.equal(deferred.case_status, "pending");
  assert.equal(
    deferred.resource_processing_state,
    "needs_identity_review",
  );

  const bound = await client.decideIdentityResolutionCase(
    proposedCaseId,
    {
      idempotency_key: `identity:${runId}:bind`,
      expected_case_version: deferred.case_version,
      decision: "bind_existing",
      selected_person_id: anchorPersonId,
      relationship_context: {
        status: "existing",
        relationship_context_id: anchorContextId,
      },
      reason:
        "The recruiter compared the source with the existing person and explicitly confirmed the binding.",
    },
  );
  assert.equal(bound.identity_status, "bound");
  assert.equal(bound.person_id, anchorPersonId);
  assert.equal(bound.relationship_context_id, anchorContextId);
  assert.equal(
    bound.resource_processing_state,
    "needs_fact_review",
  );
  const boundReplay = await client.decideIdentityResolutionCase(
    proposedCaseId,
    {
      idempotency_key: `identity:${runId}:bind`,
      expected_case_version: deferred.case_version,
      decision: "bind_existing",
      selected_person_id: anchorPersonId,
      relationship_context: {
        status: "existing",
        relationship_context_id: anchorContextId,
      },
      reason:
        "The recruiter compared the source with the existing person and explicitly confirmed the binding.",
    },
  );
  assert.deepEqual(boundReplay, bound);

  const unresolved = await client.createResourceCapture(
    request(
      runId,
      "name-only",
      {
        status: "unresolved",
        display_name_hint: "Same Name",
        handles: [],
        reason: "A name alone cannot bind identity.",
      },
      "Name-only evidence.",
    ),
  );
  assert(unresolved.identity.resolution_case_id);
  const unresolvedCaseId = unresolved.identity.resolution_case_id;
  const unresolvedCase = await client.getIdentityResolutionCase(
    unresolvedCaseId,
  );
  assert.equal(unresolvedCase.candidates.length, 0);
  const created = await client.decideIdentityResolutionCase(
    unresolvedCaseId,
    {
      idempotency_key: `identity:${runId}:create-new`,
      expected_case_version: unresolvedCase.version,
      decision: "create_new",
      display_label: "Explicitly created person",
      relationship_context: {
        status: "proposed",
        label: "New relationship context",
        purpose: "Synthetic explicit new-person binding",
      },
      binding_basis:
        "The recruiter explicitly chose a new person after reviewing the ambiguity.",
      reason:
        "No existing person was supported by the available identity evidence.",
    },
  );
  assert.equal(created.identity_status, "bound");
  assert(created.person_id);
  assert(created.relationship_context_id);
  assert.notEqual(created.person_id, anchorPersonId);

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "explicit-identity-resolution-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        candidate_case: {
          case_id: proposedCaseId,
          candidate_count: proposedCase.candidates.length,
          stale_decision_blocked: true,
          deferred_case_version: deferred.case_version,
          bound_person_id: bound.person_id,
          bound_relationship_context_id:
            bound.relationship_context_id,
          processing_state: bound.resource_processing_state,
          idempotent_replay_equal: true,
        },
        name_only_case: {
          case_id: unresolvedCaseId,
          candidate_count: unresolvedCase.candidates.length,
          created_person_id: created.person_id,
          created_relationship_context_id:
            created.relationship_context_id,
          processing_state: created.resource_processing_state,
        },
      },
      null,
      2,
    )}\n`,
  );
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
