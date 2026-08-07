import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type KnowledgeSnapshot,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";

function resumeRequest(
  runId: string,
  suffix: string,
  text: string,
  personScope: ResourceCaptureRequest["person_scope"],
): ResourceCaptureRequest {
  const clientResourceId = `resource-claim:${runId}:${suffix}`;
  const observedAt = new Date().toISOString();
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `resource-claim:${runId}:${suffix}`,
    channel: "web_upload",
    purpose: "Synthetic atomic resource-claim compilation proof",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: "resume",
      display_name: `${suffix}.txt`,
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: `runtime-resource-claim:${runId}:${suffix}`,
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
        text: `${text}\nRecord reference: ${runId}`,
        locator: {
          kind: "document_text",
          paragraph: 1,
          section_label: "Synthetic current position",
        },
        attribution: {
          actor_kind: "document_author",
          status: "proposed",
        },
        review_status: "proposed",
        parser: {
          name: "runtime-plain-text",
          version: "1.0.0",
        },
      },
    ],
  };
}

function findBlock(
  snapshot: KnowledgeSnapshot,
  predicate: (block: KnowledgeSnapshot["blocks"][number]) => boolean,
) {
  return snapshot.blocks.find(predicate);
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "resource-claim-compilation-runtime-evaluation",
  });

  const baseline = await client.createResourceCapture(
    resumeRequest(
      runId,
      "baseline",
      "Current role: Product Director",
      {
        status: "new_person",
        display_label: `Atomic claim proof ${runId.slice(0, 8)}`,
        relationship_context: {
          status: "proposed",
          label: "Synthetic executive search",
          purpose:
            "Verify atomic resource claims, conflict review, and source deletion recovery",
          role: "Candidate",
        },
        binding_basis:
          "The recruiter explicitly created this isolated synthetic person.",
      },
    ),
  );
  assert(baseline.identity.person_id);
  assert(baseline.identity.relationship_context_id);
  const personId = baseline.identity.person_id;
  const relationshipContextId =
    baseline.identity.relationship_context_id;

  let baselineDetail = await client.getRelationshipResource(
    baseline.resource.id,
  );
  const baselineFragment = baselineDetail.fragments[0];
  assert(baselineFragment);
  await client.reviewEvidenceFragment(baselineFragment.id, {
    idempotency_key: `resource-claim:${runId}:review-baseline`,
    expected_review_status: "proposed",
    decision: "reviewed",
    reason:
      "The synthetic recruiter compared the extracted text with the visible source.",
  });
  baselineDetail = await client.getRelationshipResource(
    baseline.resource.id,
  );
  const baselineClaim = baselineDetail.claim_proposals.find(
    (claim) => claim.field === "current_role",
  );
  assert(baselineClaim);
  assert.equal(baselineClaim.evidence_quote, "Current role: Product Director");
  assert.equal(baselineClaim.review_status, "pending");
  assert.equal(baselineClaim.temporal_relation, "new");

  const pendingWiki = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `resource-claim:${runId}:wiki-pending`,
      objective: "Review the proposed current role before relying on it",
    },
  );
  const pendingBlock = findBlock(
    pendingWiki,
    (block) =>
      block.type === "open_question" &&
      block.content.summary === "Product Director",
  );
  assert(pendingBlock);
  assert(
    pendingBlock.dependencies.some(
      (dependency) =>
        dependency.type === "evidence_fragment" &&
        dependency.id === baselineFragment.id,
    ),
  );
  const pendingChat = await client.createChatTask({
    idempotency_key: `resource-claim:${runId}:chat-pending`,
    objective: "Review the proposed current role before relying on it",
    person_id: personId,
    relationship_context_id: relationshipContextId,
  });
  assert(
    pendingChat.blocks.some(
      (block) =>
        block.kind === "fact_review" &&
        block.requires_user_decision,
    ),
  );

  const baselineDecision = await client.decideAssertion(
    baselineClaim.id,
    {
      idempotency_key: `resource-claim:${runId}:confirm-baseline`,
      expected_assertion_version: baselineClaim.version,
      decision: "confirm",
      corrected_value: "Product Director",
    },
  );
  assert(baselineDecision.confirmed_state_id);

  const update = await client.createResourceCapture(
    resumeRequest(
      runId,
      "updated",
      "Current role: VP Product",
      {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: relationshipContextId,
        },
        binding_basis:
          "The recruiter explicitly attached this synthetic update to the open person context.",
      },
    ),
  );
  let updateDetail = await client.getRelationshipResource(
    update.resource.id,
  );
  const updateFragment = updateDetail.fragments[0];
  assert(updateFragment);
  await client.reviewEvidenceFragment(updateFragment.id, {
    idempotency_key: `resource-claim:${runId}:review-update`,
    expected_review_status: "proposed",
    decision: "reviewed",
    reason:
      "The synthetic recruiter compared the updated extraction with the visible source.",
  });
  updateDetail = await client.getRelationshipResource(
    update.resource.id,
  );
  const updateClaim = updateDetail.claim_proposals.find(
    (claim) => claim.field === "current_role",
  );
  assert(updateClaim);
  assert.equal(updateClaim.proposal_status, "ambiguous");
  assert.equal(updateClaim.temporal_relation, "supersedes");
  assert.equal(
    updateClaim.supersedes_state_id,
    baselineDecision.confirmed_state_id,
  );

  const conflictWiki = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `resource-claim:${runId}:wiki-conflict`,
      objective: "Resolve the conflicting current role before outreach",
    },
  );
  const conflictBlock = findBlock(
    conflictWiki,
    (block) =>
      block.type === "conflict" &&
      block.content.summary === "VP Product",
  );
  assert(conflictBlock);
  assert(
    conflictBlock.dependencies.some(
      (dependency) =>
        dependency.type === "evidence_fragment" &&
        dependency.id === updateFragment.id,
    ),
  );
  assert(
    conflictBlock.dependencies.some(
      (dependency) =>
        dependency.type === "fact_version" &&
        dependency.id === baselineDecision.confirmed_state_id,
    ),
  );
  const conflictChat = await client.createChatTask({
    idempotency_key: `resource-claim:${runId}:chat-conflict`,
    objective: "Resolve the conflicting current role before outreach",
    person_id: personId,
    relationship_context_id: relationshipContextId,
  });
  assert(
    conflictChat.blocks.some(
      (block) =>
        block.kind === "conflict_review" &&
        block.requires_user_decision,
    ),
  );
  if (
    process.env.TALENT_SIGNAL_EVALUATION_STOP_AT === "conflict"
  ) {
    process.stdout.write(
      `${JSON.stringify(
        {
          artifact: "atomic-resource-claim-conflict-ui-fixture",
          contract_version: CONTRACT_VERSION,
          captured_at: new Date().toISOString(),
          person_id: personId,
          relationship_context_id: relationshipContextId,
          baseline_resource_id: baseline.resource.id,
          conflicting_resource_id: update.resource.id,
          conflicting_assertion_id: updateClaim.id,
          conflicting_evidence_fragment_id: updateFragment.id,
          conflict_wiki_snapshot_id: conflictWiki.id,
          conflict_chat_manifest_id: conflictChat.context_manifest_id,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const updateDecision = await client.decideAssertion(updateClaim.id, {
    idempotency_key: `resource-claim:${runId}:confirm-update`,
    expected_assertion_version: updateClaim.version,
    decision: "confirm",
    corrected_value: "VP Product",
  });
  assert(updateDecision.confirmed_state_id);
  const confirmedWiki = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `resource-claim:${runId}:wiki-confirmed`,
      objective: "Prepare from reviewed current information",
    },
  );
  const confirmedBlock = findBlock(
    confirmedWiki,
    (block) =>
      block.status === "confirmed" &&
      block.content.headline.includes("VP Product"),
  );
  assert(confirmedBlock);
  assert(
    !confirmedWiki.blocks.some(
      (block) =>
        block.type === "conflict" &&
        block.content.summary === "VP Product",
    ),
  );

  const deletion = await client.deleteCapture(update.capture_id, {
    idempotency_key: `resource-claim:${runId}:delete-update`,
    reason:
      "Synthetic proof that deleting superseding evidence retracts the new fact without silently restoring the prior value as current.",
  });
  const recoveryWiki = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `resource-claim:${runId}:wiki-after-delete`,
      objective: "Recheck current role after source deletion",
    },
  );
  const reopenedPriorBlock = findBlock(
    recoveryWiki,
    (block) =>
      block.status === "contested" &&
      block.content.headline.includes("Product Director"),
  );
  assert(reopenedPriorBlock);
  assert(
    !recoveryWiki.blocks.some(
      (block) =>
        block.status === "confirmed" &&
        block.content.headline.includes("VP Product"),
    ),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "atomic-resource-claim-compilation-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        scope: {
          person_id: personId,
          relationship_context_id: relationshipContextId,
        },
        baseline: {
          capture_id: baseline.capture_id,
          resource_id: baseline.resource.id,
          evidence_fragment_id: baselineFragment.id,
          assertion_id: baselineClaim.id,
          confirmed_state_id: baselineDecision.confirmed_state_id,
          pending_wiki_snapshot_id: pendingWiki.id,
          pending_chat_manifest_id: pendingChat.context_manifest_id,
        },
        conflict: {
          capture_id: update.capture_id,
          resource_id: update.resource.id,
          evidence_fragment_id: updateFragment.id,
          assertion_id: updateClaim.id,
          supersedes_state_id: updateClaim.supersedes_state_id,
          conflict_wiki_snapshot_id: conflictWiki.id,
          conflict_chat_manifest_id: conflictChat.context_manifest_id,
        },
        confirmed: {
          confirmed_state_id: updateDecision.confirmed_state_id,
          wiki_snapshot_id: confirmedWiki.id,
        },
        deletion_recovery: {
          deletion_id: deletion.deletion_id,
          derivatives_deleted: deletion.derivatives_deleted,
          recovery_wiki_snapshot_id: recoveryWiki.id,
          prior_state_status: reopenedPriorBlock.status,
          new_value_retracted: true,
          prior_value_auto_restored_as_current: false,
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
