import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
} from "@talent-signal/contracts";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";

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
    client_label: "bounded-public-research-runtime-evaluation",
  });

  const seedClientId = `research-seed:${runId}`;
  const seed = await client.createResourceCapture({
    contract_version: CONTRACT_VERSION,
    idempotency_key: `research-eval:${runId}:seed`,
    channel: "chat",
    purpose: "Synthetic bounded public research proof",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label: `Research proof ${runId.slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic public research context",
        purpose: "Verify approval, provenance, compilation, and deletion",
      },
      binding_basis:
        "The synthetic recruiter explicitly created an isolated test person.",
    },
    resource: {
      client_resource_id: seedClientId,
      kind: "public_url",
      display_name: "Example public page",
      media_type: "text/uri-list",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: "https://example.com/",
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: seedClientId,
        kind: "url_excerpt",
        sequence: 0,
        text: "https://example.com/",
        locator: {
          kind: "url_excerpt",
          canonical_url: "https://example.com/",
          retrieved_at: observedAt,
        },
        attribution: {
          actor_kind: "public_source",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: { name: "explicit-url-input", version: "1.0.0" },
      },
    ],
  });
  assert(seed.identity.person_id);
  assert(seed.identity.relationship_context_id);
  const personId = seed.identity.person_id;
  const contextId = seed.identity.relationship_context_id;

  const researchRequest = {
    idempotency_key: `research-eval:${runId}:run`,
    person_id: personId,
    relationship_context_id: contextId,
    seed_resource_id: seed.resource.id,
    purpose:
      "Retrieve one synthetic public page for bounded runtime proof",
    expected_seed_url: "https://example.com/",
    authorization: {
      decision: "approve_public_research" as const,
      allowed_domain: "example.com",
      maximum_page_count: 1,
      maximum_link_depth: 0,
    },
  };
  const research = await client.runPublicResearch(researchRequest);
  assert.equal(research.status, "completed");
  assert.equal(research.pages.length, 1);
  const page = research.pages[0];
  assert(page);

  const replay = await client.runPublicResearch(researchRequest);
  assert.equal(replay.task_id, research.task_id);
  assert.equal(replay.pages[0]?.resource_id, page.resource_id);

  const pageDetail = await client.getRelationshipResource(
    page.resource_id,
  );
  assert.equal(pageDetail.resource.input_channel, "api_connector");
  assert.equal(
    pageDetail.resource.discovered_from_resource_id,
    seed.resource.id,
  );
  assert.equal(pageDetail.fragments[0]?.review_status, "proposed");

  const wiki = await client.compileKnowledge(personId, contextId, {
    idempotency_key: `research-eval:${runId}:wiki`,
    objective: "Prepare a source-grounded person brief",
  });
  const researchBlock = wiki.blocks.find(
    (item) => item.type === "sourced_research",
  );
  assert(researchBlock);
  assert.equal(researchBlock.status, "proposed");
  assert(
    researchBlock.dependencies.some(
      (item) =>
        item.type === "research_snapshot" &&
        item.id !== page.resource_id,
    ),
  );
  assert(
    researchBlock.dependencies.some(
      (item) =>
        item.type === "source_resource" &&
        item.id === page.resource_id,
    ),
  );

  const chat = await client.createChatTask({
    idempotency_key: `research-eval:${runId}:chat`,
    objective: "Prepare a source-grounded person brief",
    person_id: personId,
    relationship_context_id: contextId,
  });
  const researchStatus = chat.blocks.find(
    (item) => item.kind === "research_status",
  );
  assert(researchStatus);
  assert.equal(researchStatus.status, "needs_review");
  assert.equal(researchStatus.requires_user_decision, true);

  const deletion = await client.deleteCapture(seed.capture_id, {
    idempotency_key: `research-eval:${runId}:delete`,
    reason:
      "Synthetic proof that deleting the seed retracts research and compiled derivatives.",
  });
  const lineage = await client.getDeletionLineage(
    deletion.deletion_id,
  );
  const lineageTypes = new Set(
    lineage.lineage.map((item) => item.entity_type),
  );
  assert(lineageTypes.has("research_task"));
  assert(lineageTypes.has("research_snapshot"));
  assert(lineageTypes.has("knowledge_snapshot"));
  assert(lineageTypes.has("context_manifest"));
  assert(lineageTypes.has("idempotency_record"));

  await expectHttpError(
    () => client.getRelationshipResource(page.resource_id),
    404,
  );
  await expectHttpError(
    () => client.getKnowledge(personId, contextId),
    404,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "bounded-public-research-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        seed: {
          capture_id: seed.capture_id,
          resource_id: seed.resource.id,
          url: "https://example.com/",
        },
        approved_scope: {
          domain: "example.com",
          maximum_page_count: 1,
          maximum_link_depth: 0,
        },
        research: {
          task_id: research.task_id,
          status: research.status,
          page_count: research.pages.length,
          page_resource_id: page.resource_id,
          page_capture_id: page.capture_id,
          page_content_hash: page.content_hash,
          page_review_status:
            pageDetail.fragments[0]?.review_status ?? null,
        },
        compiled: {
          knowledge_snapshot_id: wiki.id,
          sourced_research_status: researchBlock.status,
          chat_manifest_id: chat.context_manifest_id,
          chat_research_status: researchStatus.status,
        },
        deletion: {
          deletion_id: deletion.deletion_id,
          lineage_types: [...lineageTypes].sort(),
          derivatives_deleted: deletion.derivatives_deleted,
        },
      },
      null,
      2,
    )}\n`,
  );
}

run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
