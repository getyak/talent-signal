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

function resourceRequest(
  runId: string,
  suffix: string,
  personScope: ResourceCaptureRequest["person_scope"],
  resource: ResourceCaptureRequest["resource"],
  fragments: ResourceCaptureRequest["fragments"],
): ResourceCaptureRequest {
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `resource-deletion:${runId}:${suffix}`,
    channel: resource.kind === "document" ? "web_upload" : "chat",
    purpose: "Synthetic governed resource deletion proof",
    captured_at: new Date().toISOString(),
    source_timezone: "Asia/Singapore",
    person_scope: personScope,
    resource,
    fragments,
  };
}

async function expectHttpError(
  operation: () => Promise<unknown>,
  expectedStatus: number,
): Promise<TalentSignalHttpError> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.status, expectedStatus);
    return error;
  }
  throw new Error(`Expected HTTP ${expectedStatus}.`);
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const observedAt = new Date().toISOString();
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "resource-deletion-runtime-evaluation",
  });

  const parentClientId = `deletion-parent:${runId}`;
  const parentRequest = resourceRequest(
    runId,
    "parent",
    {
      status: "new_person",
      display_label: `Deletion proof ${runId.slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic deletion context",
        purpose: "Verify full resource-lineage retraction",
      },
      binding_basis:
        "The synthetic recruiter explicitly created this isolated test person.",
    },
    {
      client_resource_id: parentClientId,
      kind: "document",
      display_name: "profile-with-link.txt",
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: `runtime-deletion:${runId}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_extracted_text",
      },
    },
    [
      {
        client_resource_id: parentClientId,
        kind: "document_text",
        sequence: 0,
        text: "Profile evidence. Portfolio: https://example.com/deletion-proof",
        locator: { kind: "document_text", paragraph: 1 },
        attribution: {
          actor_kind: "document_author",
          status: "proposed",
        },
        review_status: "proposed",
        parser: { name: "utf8-text", version: "1.0.0" },
      },
    ],
  );
  const parent = await client.createResourceCapture(parentRequest);
  assert(parent.identity.person_id);
  assert(parent.identity.relationship_context_id);
  const personId = parent.identity.person_id;
  const relationshipContextId =
    parent.identity.relationship_context_id;

  const parentDetail = await client.getRelationshipResource(
    parent.resource.id,
  );
  const parentFragment = parentDetail.fragments[0];
  assert(parentFragment);
  await client.reviewEvidenceFragment(parentFragment.id, {
    idempotency_key: `resource-deletion:${runId}:review`,
    expected_review_status: "proposed",
    expected_last_review_id: null,
    decision: "reviewed",
    reason:
      "The synthetic recruiter compared the extracted text with the source.",
  });

  const childClientId = `deletion-child:${runId}`;
  const child = await client.createResourceCapture(
    resourceRequest(
      runId,
      "child",
      {
        status: "confirmed",
        person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: relationshipContextId,
        },
        binding_basis:
          "The child URL was explicitly saved in the visible person context.",
      },
      {
        client_resource_id: childClientId,
        kind: "public_url",
        display_name: "Discovered portfolio seed",
        media_type: "text/uri-list",
        observed_at: observedAt,
        source_timezone: "Asia/Singapore",
        source_locator: "https://example.com/deletion-proof",
        discovered_from_resource_id: parent.resource.id,
        discovered_from_client_resource_id: parentClientId,
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      [
        {
          client_resource_id: childClientId,
          kind: "url_excerpt",
          sequence: 0,
          text: "https://example.com/deletion-proof",
          locator: {
            kind: "url_excerpt",
            canonical_url: "https://example.com/deletion-proof",
            retrieved_at: observedAt,
          },
          attribution: {
            actor_kind: "public_source",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: {
            name: "document-link-discovery",
            version: "1.0.0",
          },
        },
      ],
    ),
  );

  const snapshot = await client.compileKnowledge(
    personId,
    relationshipContextId,
    {
      idempotency_key: `resource-deletion:${runId}:wiki`,
      objective: "Verify source-derived context before deletion",
    },
  );
  const chat = await client.createChatTask({
    idempotency_key: `resource-deletion:${runId}:chat`,
    objective: "Verify source-derived context before deletion",
    person_id: personId,
    relationship_context_id: relationshipContextId,
  });

  const deletion = await client.deleteCapture(parent.capture_id, {
    idempotency_key: `resource-deletion:${runId}:delete`,
    reason:
      "Synthetic proof that deleting a parent source retracts discovered descendants.",
  });
  const lineage = await client.getDeletionLineage(deletion.deletion_id);
  const lineageTypes = new Set(
    lineage.lineage.map((entry) => entry.entity_type),
  );
  const revokedCaptureIds = lineage.lineage
    .filter((entry) => entry.entity_type === "capture")
    .map((entry) => entry.entity_id);

  assert(revokedCaptureIds.includes(parent.capture_id));
  assert(revokedCaptureIds.includes(child.capture_id));
  assert(lineageTypes.has("evidence_fragment_review"));
  assert(lineageTypes.has("knowledge_snapshot"));
  assert(lineageTypes.has("context_manifest"));
  assert(lineageTypes.has("idempotency_record"));

  await expectHttpError(
    () => client.getRelationshipResource(parent.resource.id),
    404,
  );
  await expectHttpError(
    () => client.getRelationshipResource(child.resource.id),
    404,
  );
  await expectHttpError(
    () =>
      client.getKnowledge(
        personId,
        relationshipContextId,
      ),
    404,
  );
  const replayAfterDeletion = await expectHttpError(
    () => client.createResourceCapture(parentRequest),
    409,
  );
  assert.equal(
    replayAfterDeletion.code,
    "IDEMPOTENCY_STATE_UNAVAILABLE",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "resource-lineage-deletion-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        parent: {
          capture_id: parent.capture_id,
          resource_id: parent.resource.id,
        },
        discovered_child: {
          capture_id: child.capture_id,
          resource_id: child.resource.id,
        },
        invalidated: {
          knowledge_snapshot_id: snapshot.id,
          context_manifest_id: chat.context_manifest_id,
          revoked_capture_ids: revokedCaptureIds,
          lineage_types: [...lineageTypes].sort(),
          derivative_count: deletion.derivatives_deleted,
        },
        replay_after_deletion: {
          status: replayAfterDeletion.status,
          code: replayAfterDeletion.code,
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
