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

function sourceRequest(input: {
  runId: string;
  suffix: string;
  channel: ResourceCaptureRequest["channel"];
  kind: "personal_note" | "resume" | "document";
  text: string;
  reviewStatus: "proposed" | "reviewed";
  personScope: ResourceCaptureRequest["person_scope"];
  discoveredFrom?: {
    clientResourceId: string;
    resourceId: string;
  };
}): ResourceCaptureRequest {
  const clientResourceId = `identity-correction:${input.runId}:${input.suffix}`;
  const observedAt = new Date().toISOString();
  const fragmentKind =
    input.kind === "personal_note"
      ? "note_revision"
      : "document_text";
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `identity-correction:${input.runId}:${input.suffix}`,
    channel: input.channel,
    purpose: "Synthetic reversible identity-correction proof",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: input.personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: input.kind,
      display_name: `${input.suffix}.txt`,
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: `runtime-identity-correction:${input.runId}:${input.suffix}`,
      ...(input.discoveredFrom
        ? {
            discovered_from_client_resource_id:
              input.discoveredFrom.clientResourceId,
            discovered_from_resource_id:
              input.discoveredFrom.resourceId,
          }
        : {}),
      retention: {
        requested_mode: "ephemeral",
        source_scope:
          input.kind === "personal_note"
            ? "reviewed_selected_text"
            : "reviewed_extracted_text",
      },
    },
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: fragmentKind,
        sequence: 0,
        text: `${input.text}\nRecord reference: ${input.runId}`,
        locator:
          fragmentKind === "note_revision"
            ? { kind: "note_revision", revision: 1 }
            : {
                kind: "document_text",
                paragraph: 1,
                section_label: "Synthetic identity correction",
              },
        attribution:
          input.kind === "personal_note"
            ? { actor_kind: "recruiter", status: "confirmed" }
            : { actor_kind: "document_author", status: "proposed" },
        review_status: input.reviewStatus,
        parser: {
          name: "runtime-plain-text",
          version: "1.0.0",
        },
      },
    ],
  };
}

async function expectHttpError(
  operation: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "identity-correction-runtime-evaluation",
  });

  const correctAnchor = await client.createResourceCapture(
    sourceRequest({
      runId,
      suffix: "correct-person-anchor",
      channel: "chat",
      kind: "personal_note",
      text: "Explicit synthetic anchor for the correct person.",
      reviewStatus: "reviewed",
      personScope: {
        status: "new_person",
        display_label: `Correct identity ${runId.slice(0, 8)}`,
        relationship_context: {
          status: "proposed",
          label: "Correct executive-search relationship",
          purpose: "Receive the corrected multichannel source lineage",
          role: "Candidate",
        },
        binding_basis:
          "The recruiter explicitly created the correct synthetic person.",
      },
    }),
  );
  assert(correctAnchor.identity.person_id);
  assert(correctAnchor.identity.relationship_context_id);
  const correctPersonId = correctAnchor.identity.person_id;
  const correctContextId =
    correctAnchor.identity.relationship_context_id;

  const wrongRootClientResourceId =
    `identity-correction:${runId}:wrong-resume-root`;
  const wrongRoot = await client.createResourceCapture(
    sourceRequest({
      runId,
      suffix: "wrong-resume-root",
      channel: "web_upload",
      kind: "resume",
      text: "Current role: Product Director",
      reviewStatus: "proposed",
      personScope: {
        status: "new_person",
        display_label: `Wrong identity ${runId.slice(0, 8)}`,
        relationship_context: {
          status: "proposed",
          label: "Wrongly bound executive-search relationship",
          purpose:
            "Prove that a reviewed source can be safely moved after a binding error",
          role: "Candidate",
        },
        binding_basis:
          "The synthetic recruiter intentionally seeded a wrong binding for recovery testing.",
      },
    }),
  );
  assert(wrongRoot.identity.person_id);
  assert(wrongRoot.identity.relationship_context_id);
  const wrongPersonId = wrongRoot.identity.person_id;
  const wrongContextId =
    wrongRoot.identity.relationship_context_id;

  const child = await client.createResourceCapture(
    sourceRequest({
      runId,
      suffix: "derived-portfolio",
      channel: "browser_extension",
      kind: "document",
      text: "A governed child resource discovered from the resume.",
      reviewStatus: "reviewed",
      personScope: {
        status: "confirmed",
        person_id: wrongPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: wrongContextId,
        },
        binding_basis:
          "The child source was discovered from the explicitly bound synthetic resume.",
      },
      discoveredFrom: {
        clientResourceId: wrongRootClientResourceId,
        resourceId: wrongRoot.resource.id,
      },
    }),
  );

  let wrongRootDetail = await client.getRelationshipResource(
    wrongRoot.resource.id,
  );
  const rootFragment = wrongRootDetail.fragments[0];
  assert(rootFragment);
  await client.reviewEvidenceFragment(rootFragment.id, {
    idempotency_key: `identity-correction:${runId}:review-root`,
    expected_review_status: "proposed",
    expected_last_review_id: null,
    decision: "reviewed",
    reason:
      "The synthetic recruiter compared the extracted current role with the visible source.",
  });
  wrongRootDetail = await client.getRelationshipResource(
    wrongRoot.resource.id,
  );
  const currentRoleClaim =
    wrongRootDetail.claim_proposals.find(
      (claim) => claim.field === "current_role",
    );
  assert(currentRoleClaim);
  const confirmed = await client.decideAssertion(
    currentRoleClaim.id,
    {
      idempotency_key: `identity-correction:${runId}:confirm-role`,
      expected_assertion_version: currentRoleClaim.version,
      decision: "confirm",
      corrected_value: "Product Director",
    },
  );
  assert(confirmed.confirmed_state_id);

  const wrongWiki = await client.compileKnowledge(
    wrongPersonId,
    wrongContextId,
    {
      idempotency_key: `identity-correction:${runId}:wrong-wiki`,
      objective: "Prepare from the wrongly bound source before correction",
    },
  );
  assert(
    wrongWiki.blocks.some(
      (block) =>
        block.status === "confirmed" &&
        block.content.headline.includes("Product Director"),
    ),
  );
  const wrongChat = await client.createChatTask({
    idempotency_key: `identity-correction:${runId}:wrong-chat`,
    objective: "Prepare from the wrongly bound source before correction",
    person_id: wrongPersonId,
    relationship_context_id: wrongContextId,
  });

  const firstCorrectionRequest = {
    idempotency_key: `identity-correction:${runId}:move-to-correct`,
    expected_capture_version:
      wrongRootDetail.resource.capture_version,
    expected_person_id: wrongPersonId,
    expected_relationship_context_id: wrongContextId,
    reason:
      "The recruiter compared the source with the stable contact and found the original person binding was wrong.",
    binding_basis:
      "The correct contact and relationship context were explicitly selected after reviewing the source.",
    target: {
      status: "existing_person" as const,
      person_id: correctPersonId,
      relationship_context: {
        status: "existing" as const,
        relationship_context_id: correctContextId,
      },
    },
  };
  const firstCorrection = await client.correctCaptureIdentity(
    wrongRoot.capture_id,
    firstCorrectionRequest,
  );
  assert.deepEqual(
    new Set(firstCorrection.capture_ids_rebound),
    new Set([wrongRoot.capture_id, child.capture_id]),
  );
  assert.equal(firstCorrection.states_retracted, 1);
  assert.equal(firstCorrection.claims_reopened, 1);
  assert(
    firstCorrection.knowledge_snapshots_invalidated.includes(
      wrongWiki.id,
    ),
  );
  const firstReplay = await client.correctCaptureIdentity(
    wrongRoot.capture_id,
    firstCorrectionRequest,
  );
  assert.deepEqual(firstReplay, firstCorrection);

  await expectHttpError(
    () =>
      client.correctCaptureIdentity(wrongRoot.capture_id, {
        ...firstCorrectionRequest,
        idempotency_key: `identity-correction:${runId}:stale`,
      }),
    409,
    "IDENTITY_CORRECTION_STALE",
  );
  await expectHttpError(
    () => client.getKnowledge(wrongPersonId, wrongContextId),
    404,
    "WIKI_SNAPSHOT_NOT_FOUND",
  );

  const wrongResourcesAfterMove =
    await client.listRelationshipResources(
      wrongPersonId,
      wrongContextId,
    );
  const correctResourcesAfterMove =
    await client.listRelationshipResources(
      correctPersonId,
      correctContextId,
    );
  assert(
    !wrongResourcesAfterMove.resources.some(
      (resource) =>
        resource.id === wrongRoot.resource.id ||
        resource.id === child.resource.id,
    ),
  );
  assert(
    correctResourcesAfterMove.resources.some(
      (resource) => resource.id === wrongRoot.resource.id,
    ),
  );
  assert(
    correctResourcesAfterMove.resources.some(
      (resource) => resource.id === child.resource.id,
    ),
  );

  let correctRootDetail = await client.getRelationshipResource(
    wrongRoot.resource.id,
  );
  const reopenedClaim =
    correctRootDetail.claim_proposals.find(
      (claim) => claim.field === "current_role",
    );
  assert(reopenedClaim);
  assert.equal(reopenedClaim.review_status, "pending");
  assert.equal(reopenedClaim.temporal_relation, "new");

  const firstCorrectWiki = await client.compileKnowledge(
    correctPersonId,
    correctContextId,
    {
      idempotency_key: `identity-correction:${runId}:correct-wiki-first`,
      objective: "Review the source after identity correction",
    },
  );
  assert(
    firstCorrectWiki.blocks.some(
      (block) =>
        block.type === "open_question" &&
        block.content.summary === "Product Director",
    ),
  );
  const firstCorrectChat = await client.createChatTask({
    idempotency_key: `identity-correction:${runId}:correct-chat-first`,
    objective: "Review the source after identity correction",
    person_id: correctPersonId,
    relationship_context_id: correctContextId,
  });
  assert(
    firstCorrectChat.blocks.some(
      (block) =>
        block.kind === "fact_review" &&
        block.requires_user_decision,
    ),
  );

  const reverse = await client.correctCaptureIdentity(
    wrongRoot.capture_id,
    {
      idempotency_key: `identity-correction:${runId}:reverse`,
      expected_capture_version:
        correctRootDetail.resource.capture_version,
      expected_person_id: correctPersonId,
      expected_relationship_context_id: correctContextId,
      reason:
        "Synthetic reversal proves the internal correction can be safely changed again.",
      binding_basis:
        "The original synthetic person and relationship were explicitly selected.",
      target: {
        status: "existing_person",
        person_id: wrongPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: wrongContextId,
        },
      },
    },
  );
  assert.equal(reverse.person_id, wrongPersonId);
  assert.equal(reverse.states_retracted, 0);
  await expectHttpError(
    () => client.getKnowledge(correctPersonId, correctContextId),
    404,
    "WIKI_SNAPSHOT_NOT_FOUND",
  );

  const finalCorrection = await client.correctCaptureIdentity(
    wrongRoot.capture_id,
    {
      idempotency_key: `identity-correction:${runId}:final`,
      expected_capture_version: reverse.root_capture_version,
      expected_person_id: wrongPersonId,
      expected_relationship_context_id: wrongContextId,
      reason:
        "The synthetic recruiter restored the reviewed correct binding after proving reversibility.",
      binding_basis:
        "The stable correct person and relationship were explicitly selected again.",
      target: {
        status: "existing_person",
        person_id: correctPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: correctContextId,
        },
      },
    },
  );
  assert.equal(finalCorrection.person_id, correctPersonId);
  assert.equal(
    finalCorrection.root_capture_version,
    reverse.root_capture_version + 1,
  );

  correctRootDetail = await client.getRelationshipResource(
    wrongRoot.resource.id,
  );
  const finalClaim = correctRootDetail.claim_proposals.find(
    (claim) => claim.field === "current_role",
  );
  assert(finalClaim);
  assert.equal(finalClaim.review_status, "pending");
  const finalWiki = await client.compileKnowledge(
    correctPersonId,
    correctContextId,
    {
      idempotency_key: `identity-correction:${runId}:correct-wiki-final`,
      objective: "Review the final corrected person before outreach",
    },
  );
  const finalChat = await client.createChatTask({
    idempotency_key: `identity-correction:${runId}:correct-chat-final`,
    objective: "Review the final corrected person before outreach",
    person_id: correctPersonId,
    relationship_context_id: correctContextId,
  });
  assert(
    finalWiki.blocks.some(
      (block) =>
        block.type === "open_question" &&
        block.content.summary === "Product Director",
    ),
  );
  assert(
    !finalWiki.blocks.some(
      (block) =>
        block.status === "confirmed" &&
        block.content.headline.includes("Product Director"),
    ),
  );
  assert(
    finalChat.blocks.some(
      (block) => block.kind === "fact_review",
    ),
  );

  const rebuiltWrongWiki = await client.compileKnowledge(
    wrongPersonId,
    wrongContextId,
    {
      idempotency_key: `identity-correction:${runId}:wrong-wiki-rebuilt`,
      objective: "Verify the moved source no longer appears here",
    },
  );
  assert(
    !rebuiltWrongWiki.blocks.some(
      (block) =>
        block.content.headline.includes("Product Director") ||
        block.dependencies.some(
          (dependency) => dependency.id === rootFragment.id,
        ),
    ),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "reversible-identity-correction-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        source_lineage: {
          root_capture_id: wrongRoot.capture_id,
          root_resource_id: wrongRoot.resource.id,
          child_capture_id: child.capture_id,
          child_resource_id: child.resource.id,
          evidence_fragment_id: rootFragment.id,
          assertion_id: currentRoleClaim.id,
          original_confirmed_state_id: confirmed.confirmed_state_id,
        },
        prior_scope: {
          person_id: wrongPersonId,
          relationship_context_id: wrongContextId,
          invalidated_wiki_snapshot_id: wrongWiki.id,
          invalidated_chat_manifest_id:
            wrongChat.context_manifest_id,
          rebuilt_wiki_snapshot_id: rebuiltWrongWiki.id,
          moved_source_absent_after_rebuild: true,
        },
        corrected_scope: {
          person_id: correctPersonId,
          relationship_context_id: correctContextId,
          final_wiki_snapshot_id: finalWiki.id,
          final_chat_manifest_id: finalChat.context_manifest_id,
          fact_returned_to_review: true,
        },
        first_correction: firstCorrection,
        reversal: {
          decision_id: reverse.decision_id,
          root_capture_version: reverse.root_capture_version,
          target_snapshot_invalidated: true,
        },
        final_correction: {
          decision_id: finalCorrection.decision_id,
          root_capture_version:
            finalCorrection.root_capture_version,
          lineage_capture_count:
            finalCorrection.capture_ids_rebound.length,
          claims_reopened: finalCorrection.claims_reopened,
        },
        safety: {
          stale_decision_blocked: true,
          idempotent_replay_equal: true,
          confirmed_wrong_identity_state_retracted: true,
          old_wiki_and_chat_invalidated: true,
          no_fact_auto_promoted_under_new_identity: true,
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
