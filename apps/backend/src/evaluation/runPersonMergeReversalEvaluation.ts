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

function noteRequest(input: {
  runId: string;
  suffix: string;
  label: string;
  email?: string;
  personScope: ResourceCaptureRequest["person_scope"];
}): ResourceCaptureRequest {
  const clientResourceId = `person-merge:${input.runId}:${input.suffix}`;
  const observedAt = new Date().toISOString();
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `person-merge:${input.runId}:${input.suffix}`,
    channel: "chat",
    purpose: "Synthetic reversible person-merge proof",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: input.personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: input.email ? "contact_record" : "personal_note",
      display_name: `${input.label}.txt`,
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: `runtime-person-merge:${input.runId}:${input.suffix}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    ...(input.email
      ? {
          confirmed_identity_handles: [
            {
              type: "email" as const,
              value: input.email,
              source_client_resource_id: clientResourceId,
            },
          ],
        }
      : {}),
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: input.email ? "contact_field" : "note_revision",
        sequence: 0,
        text: input.email
          ? `Email: ${input.email}`
          : `Recruiter-authored merge proof note for ${input.label}. ` +
            `Synthetic run ${input.runId}.`,
        locator: input.email
          ? {
              kind: "contact_field",
              field: "email",
              source_record_version: "1",
            }
          : { kind: "note_revision", revision: 1 },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: {
          name: "person-merge-reversal-evaluation",
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
    client_label: "person-merge-reversal-evaluation",
  });
  const target = await client.createResourceCapture(
    noteRequest({
      runId,
      suffix: "target-anchor",
      label: "Primary stable contact",
      email: `primary-${runId}@example.test`,
      personScope: {
        status: "new_person",
        display_label: `Primary contact ${runId.slice(0, 8)}`,
        relationship_context: {
          status: "proposed",
          label: "Primary retained relationship",
          purpose: "Remain the stable person after merge review",
          role: "Candidate",
        },
        binding_basis:
          "The recruiter explicitly created the primary synthetic person.",
      },
    }),
  );
  const source = await client.createResourceCapture(
    noteRequest({
      runId,
      suffix: "duplicate-anchor",
      label: "Possible duplicate contact",
      email: `alternate-${runId}@example.test`,
      personScope: {
        status: "new_person",
        display_label: `Duplicate contact ${runId.slice(0, 8)}`,
        relationship_context: {
          status: "proposed",
          label: "Search relationship to preserve",
          purpose: "Move this context without flattening it",
          role: "Candidate",
        },
        binding_basis:
          "The recruiter explicitly created the second synthetic person for duplicate review.",
      },
    }),
  );
  assert(target.identity.person_id);
  assert(target.identity.relationship_context_id);
  assert(source.identity.person_id);
  assert(source.identity.relationship_context_id);
  const targetPersonId = target.identity.person_id;
  const targetContextId = target.identity.relationship_context_id;
  const sourcePersonId = source.identity.person_id;
  const sourceContextId = source.identity.relationship_context_id;

  const secondSourceContext = await client.createResourceCapture(
    noteRequest({
      runId,
      suffix: "duplicate-second-context",
      label: "Second relationship",
      personScope: {
        status: "confirmed",
        person_id: sourcePersonId,
        relationship_context: {
          status: "proposed",
          label: "Referral relationship to preserve",
          purpose: "Prove contexts remain distinct through identity merge",
          role: "Referrer",
        },
        binding_basis:
          "The recruiter selected the same synthetic person and created a separate relationship context.",
      },
    }),
  );
  assert(secondSourceContext.identity.relationship_context_id);
  const secondSourceContextId =
    secondSourceContext.identity.relationship_context_id;

  const stalePreview = await client.previewPersonMerge(
    sourcePersonId,
    targetPersonId,
  );
  await client.createResourceCapture(
    noteRequest({
      runId,
      suffix: "duplicate-late-note",
      label: "Late source before merge",
      personScope: {
        status: "confirmed",
        person_id: sourcePersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: sourceContextId,
        },
        binding_basis:
          "The recruiter attached a new source after the first merge preview.",
      },
    }),
  );
  await expectHttpError(
    () =>
      client.mergePeople({
        idempotency_key: `person-merge:${runId}:stale-attempt`,
        source_person_id: sourcePersonId,
        target_person_id: targetPersonId,
        expected_source_version: stalePreview.source_person.version,
        expected_target_version: stalePreview.target_person.version,
        expected_preview_digest: stalePreview.preview_digest,
        decision: "merge_people",
        reason: "This stale preview must not change identity.",
      }),
    409,
    "PERSON_MERGE_PREVIEW_STALE",
  );

  const preview = await client.previewPersonMerge(
    sourcePersonId,
    targetPersonId,
  );
  assert.equal(preview.contexts_to_move.length, 2);
  assert.equal(preview.active_capture_count, 3);
  assert.equal(preview.blockers.length, 0);
  assert(
    preview.review_items.some(
      (item) => item.kind === "display_label_difference",
    ),
  );
  assert(
    preview.review_items.some(
      (item) => item.kind === "identity_handle_difference",
    ),
  );

  const mergeRequest = {
    idempotency_key: `person-merge:${runId}:apply`,
    source_person_id: sourcePersonId,
    target_person_id: targetPersonId,
    expected_source_version: preview.source_person.version,
    expected_target_version: preview.target_person.version,
    expected_preview_digest: preview.preview_digest,
    decision: "merge_people" as const,
    reason:
      "The recruiter reviewed the two labels, masked handles, and separate relationships and confirmed one stable person.",
  };
  const merged = await client.mergePeople(mergeRequest);
  assert.equal(merged.status, "applied");
  assert.equal(merged.captures_rebound, 3);
  assert.deepEqual(
    new Set(merged.affected_relationship_context_ids),
    new Set([sourceContextId, secondSourceContextId]),
  );
  assert.deepEqual(
    new Set(
      merged.relationship_context_ids_requiring_recompilation,
    ),
    new Set([sourceContextId, secondSourceContextId, targetContextId]),
  );
  const replayedMerge = await client.mergePeople(mergeRequest);
  assert.deepEqual(replayedMerge, merged);

  await client.getRelationshipScope(targetPersonId, sourceContextId);
  await client.getRelationshipScope(targetPersonId, secondSourceContextId);
  await client.getRelationshipScope(targetPersonId, targetContextId);
  await expectHttpError(
    () => client.getRelationshipScope(sourcePersonId, sourceContextId),
    409,
    "PERSON_MERGED",
  );
  const mergedDirectory = await client.searchPeople(
    `Primary contact ${runId.slice(0, 8)}`,
  );
  const mergedTarget = mergedDirectory.people.find(
    (person) => person.id === targetPersonId,
  );
  assert.equal(mergedTarget?.context_count, 3);
  const hiddenSource = await client.searchPeople(
    `Duplicate contact ${runId.slice(0, 8)}`,
  );
  assert(
    hiddenSource.people.every((person) => person.id !== sourcePersonId),
  );
  for (const contextId of [sourceContextId, secondSourceContextId]) {
    const wiki = await client.compileKnowledge(targetPersonId, contextId, {
      idempotency_key: `person-merge:${runId}:merged-wiki:${contextId}`,
      objective: "Compile one preserved relationship after explicit merge",
    });
    assert.equal(wiki.status, "published");
    assert.equal(wiki.quality.verdict, "gold");
  }

  const reloadedReversalPreview =
    await client.getPersonMergeReversalPreview(merged.operation_id);
  assert.equal(reloadedReversalPreview.status, "applied");
  assert.equal(reloadedReversalPreview.reversal_available, true);
  assert.equal(reloadedReversalPreview.blockers.length, 0);
  assert.equal(
    reloadedReversalPreview.original_reason,
    mergeRequest.reason,
  );
  assert.deepEqual(
    new Set(
      reloadedReversalPreview.contexts_to_restore.map(
        (context) => context.id,
      ),
    ),
    new Set([sourceContextId, secondSourceContextId]),
  );

  const postMergeDependency = await client.createResourceCapture(
    noteRequest({
      runId,
      suffix: "post-merge-dependency",
      label: "Evidence added after merge",
      personScope: {
        status: "confirmed",
        person_id: targetPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: sourceContextId,
        },
        binding_basis:
          "The recruiter added this synthetic source after the people were merged.",
      },
    }),
  );
  const blockedReversalPreview =
    await client.getPersonMergeReversalPreview(merged.operation_id);
  assert.equal(blockedReversalPreview.reversal_available, false);
  assert(
    blockedReversalPreview.blockers.some(
      (blocker) =>
        blocker.code === "new_relationship_dependencies" &&
        blocker.count >= 1,
    ),
  );
  await expectHttpError(
    () =>
      client.reversePersonMerge(merged.operation_id, {
        idempotency_key: `person-merge:${runId}:blocked-reverse`,
        decision: "reverse_person_merge",
        reason:
          "This reversal must pause because the retained person gained new relationship evidence.",
      }),
    409,
    "PERSON_MERGE_REVERSAL_REVIEW_REQUIRED",
  );

  await client.deleteCapture(postMergeDependency.capture_id, {
    idempotency_key: `person-merge:${runId}:delete-post-merge-dependency`,
    reason:
      "Remove the synthetic post-merge dependency before restoring the original separate people.",
  });
  const repairedReversalPreview =
    await client.getPersonMergeReversalPreview(merged.operation_id);
  assert.equal(repairedReversalPreview.reversal_available, true);
  assert.equal(repairedReversalPreview.blockers.length, 0);

  const reversed = await client.reversePersonMerge(merged.operation_id, {
    idempotency_key: `person-merge:${runId}:reverse`,
    decision: "reverse_person_merge",
    reason:
      "The recruiter intentionally reversed the synthetic merge to prove that context ownership and sources can be restored.",
  });
  assert.equal(reversed.status, "reversed");
  assert.equal(reversed.reversal_available, false);
  const reversedReversalPreview =
    await client.getPersonMergeReversalPreview(merged.operation_id);
  assert.equal(reversedReversalPreview.status, "reversed");
  assert.equal(reversedReversalPreview.reversal_available, false);
  assert(
    reversedReversalPreview.blockers.some(
      (blocker) => blocker.code === "operation_already_reversed",
    ),
  );
  assert.deepEqual(
    new Set(
      reversed.relationship_context_ids_requiring_recompilation,
    ),
    new Set([sourceContextId, secondSourceContextId, targetContextId]),
  );
  await client.getRelationshipScope(sourcePersonId, sourceContextId);
  await client.getRelationshipScope(
    sourcePersonId,
    secondSourceContextId,
  );
  await expectHttpError(
    () => client.getRelationshipScope(targetPersonId, sourceContextId),
    404,
    "RELATIONSHIP_CONTEXT_NOT_FOUND",
  );
  const restoredSource = await client.searchPeople(
    `Duplicate contact ${runId.slice(0, 8)}`,
  );
  assert(
    restoredSource.people.some((person) => person.id === sourcePersonId),
  );

  const otherAccount = new TalentSignalClient(baseUrl);
  await otherAccount.login({
    account_slug: "fixture-beta",
    user_email: "recruiter@beta.local",
    client_label: "person-merge-cross-account-evaluation",
  });
  await expectHttpError(
    () =>
      otherAccount.previewPersonMerge(sourcePersonId, targetPersonId),
    404,
    "PERSON_MERGE_PERSON_NOT_FOUND",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "reversible-person-merge-runtime-proof",
        source_person_id: sourcePersonId,
        target_person_id: targetPersonId,
        operation_id: merged.operation_id,
        stale_preview_rejected: true,
        label_and_handle_review_items_visible: true,
        contexts_preserved_without_flattening: 2,
        captures_rebound: merged.captures_rebound,
        merged_person_hidden_from_directory: true,
        moved_relationships_compiled_gold: true,
        idempotent_merge_replay: true,
        durable_reversal_preview_reloaded: true,
        reversal_blocked_by_new_relationship_evidence: true,
        blocked_reversal_rejected_server_side: true,
        reversal_reenabled_after_dependency_removal: true,
        reversed_operation_reported_as_unavailable: true,
        reversal_restored_source_person: true,
        cross_account_preview_denied: true,
      },
      null,
      2,
    )}\n`,
  );
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
