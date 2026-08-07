import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";
const now = "2026-08-06T13:00:00.000Z";

function request(
  suffix: string,
  personScope: ResourceCaptureRequest["person_scope"],
  resource: ResourceCaptureRequest["resource"],
  fragments: ResourceCaptureRequest["fragments"],
): ResourceCaptureRequest {
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `resource-runtime:${suffix}`,
    channel:
      resource.kind === "resume" ? "web_upload" : "chat",
    purpose: `Synthetic runtime proof for ${resource.kind}`,
    captured_at: now,
    source_timezone: "Asia/Singapore",
    person_scope: personScope,
    resource,
    fragments,
  };
}

async function run(): Promise<void> {
  const alpha = new TalentSignalClient(baseUrl);
  await alpha.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "resource-intake-runtime-evaluation",
  });

  const noteClientId = "runtime-note-1";
  const note = await alpha.createResourceCapture(
    request(
      "note-new-person",
      {
        status: "new_person",
        display_label: "周屿",
        relationship_context: {
          status: "proposed",
          label: "VP Product · Northstar search",
          purpose: "Synthetic relationship compilation proof",
        },
        binding_basis:
          "The synthetic recruiter explicitly chose to create a new person.",
      },
      {
        client_resource_id: noteClientId,
        kind: "personal_note",
        display_name: "Thursday call preparation",
        media_type: "text/plain",
        observed_at: now,
        source_timezone: "Asia/Singapore",
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      [
        {
          client_resource_id: noteClientId,
          kind: "note_revision",
          sequence: 0,
          text:
            "Ask how the product mandate changes the team they would inherit.",
          locator: { kind: "note_revision", revision: 1 },
          attribution: {
            actor_kind: "recruiter",
            status: "confirmed",
          },
          review_status: "reviewed",
          parser: { name: "direct-note-input", version: "1.0.0" },
        },
      ],
    ),
  );
  assert.equal(note.identity.status, "bound");
  assert(note.identity.person_id);
  assert(note.identity.relationship_context_id);
  assert.equal(note.resource.processing_state, "ready");

  const personScope: ResourceCaptureRequest["person_scope"] = {
    status: "confirmed",
    person_id: note.identity.person_id,
    relationship_context: {
      status: "existing",
      relationship_context_id: note.identity.relationship_context_id,
    },
    binding_basis:
      "The synthetic recruiter selected the existing person and context.",
  };
  const resumeText =
    "VP Product at Example Co. Led a 12-person team. Portfolio: https://example.com/zhou";
  const resumeHash = createHash("sha256")
    .update("synthetic-runtime-resume")
    .digest("hex");
  const resumeClientId = "runtime-resume-1";
  const resumeRequest = request(
    "resume",
    personScope,
    {
      client_resource_id: resumeClientId,
      kind: "resume",
      display_name: "zhou-yu-resume.txt",
      media_type: "text/plain",
      observed_at: now,
      source_timezone: "Asia/Singapore",
      byte_size: Buffer.byteLength(resumeText),
      content_hash: resumeHash,
      source_locator: "runtime-document:resume-1",
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_extracted_text",
      },
    },
    [
      {
        client_resource_id: resumeClientId,
        kind: "document_text",
        sequence: 0,
        text: resumeText,
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
  const resume = await alpha.createResourceCapture(resumeRequest);
  assert.equal(resume.identity.person_id, note.identity.person_id);
  assert.equal(
    resume.identity.relationship_context_id,
    note.identity.relationship_context_id,
  );
  assert.equal(resume.resource.processing_state, "needs_fact_review");

  const duplicateClientId = "runtime-resume-duplicate";
  const duplicate = await alpha.createResourceCapture(
    request(
      "resume-duplicate",
      personScope,
      {
        ...resumeRequest.resource,
        client_resource_id: duplicateClientId,
      },
      resumeRequest.fragments.map((fragment) => ({
        ...fragment,
        client_resource_id: duplicateClientId,
      })),
    ),
  );
  assert.equal(
    duplicate.resource.duplicate_of_resource_id,
    resume.resource.id,
  );

  const urlClientId = "runtime-url-1";
  const url = await alpha.createResourceCapture(
    request(
      "public-url",
      personScope,
      {
        client_resource_id: urlClientId,
        kind: "public_url",
        display_name: "Portfolio seed",
        media_type: "text/uri-list",
        observed_at: now,
        source_timezone: "Asia/Singapore",
        source_locator: "https://example.com/zhou",
        discovered_from_resource_id: resume.resource.id,
        discovered_from_client_resource_id: resumeClientId,
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_selected_text",
        },
      },
      [
        {
          client_resource_id: urlClientId,
          kind: "url_excerpt",
          sequence: 0,
          text: "https://example.com/zhou",
          locator: {
            kind: "url_excerpt",
            canonical_url: "https://example.com/zhou",
            retrieved_at: now,
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
  assert.equal(url.resource.processing_state, "ready");

  const unresolvedClientId = "runtime-unresolved-document";
  const unresolved = await alpha.createResourceCapture(
    request(
      "unresolved-name-only",
      {
        status: "unresolved",
        display_name_hint: "周屿",
        handles: [],
        reason: "A name alone is not an identity binding.",
      },
      {
        client_resource_id: unresolvedClientId,
        kind: "document",
        display_name: "name-only.txt",
        media_type: "text/plain",
        observed_at: now,
        source_timezone: "Asia/Singapore",
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_extracted_text",
        },
      },
      [
        {
          client_resource_id: unresolvedClientId,
          kind: "document_text",
          sequence: 0,
          text: "This source only shares a display name.",
          locator: { kind: "document_text", paragraph: 1 },
          attribution: {
            actor_kind: "document_author",
            status: "proposed",
          },
          review_status: "proposed",
          parser: { name: "utf8-text", version: "1.0.0" },
        },
      ],
    ),
  );
  assert.equal(unresolved.identity.status, "unresolved");
  assert.equal(unresolved.identity.person_id, null);
  assert(unresolved.identity.resolution_case_id);

  const snapshot = await alpha.compileKnowledge(
    note.identity.person_id,
    note.identity.relationship_context_id,
    {
      idempotency_key: "resource-runtime:wiki",
      objective: "Prepare the next candidate conversation",
    },
  );
  const blockKeys = snapshot.blocks.map((block) => block.block_key);
  assert(blockKeys.some((key) => key.startsWith("resource.personal-note.")));
  assert(blockKeys.some((key) => key.startsWith("resource.resume.")));
  assert(blockKeys.some((key) => key.startsWith("resource.public-url.")));
  assert.equal(
    blockKeys.filter((key) => key.startsWith("resource.resume.")).length,
    1,
  );

  const chat = await alpha.createChatTask({
    idempotency_key: "resource-runtime:chat",
    objective: "Prepare the next candidate conversation",
    person_id: note.identity.person_id,
    relationship_context_id: note.identity.relationship_context_id,
  });
  const chatKinds = chat.blocks.map((block) => block.kind);
  assert(chatKinds.includes("fact_review"));
  assert(chatKinds.includes("research_status"));
  assert(chatKinds.includes("source_receipt"));

  const retention = await alpha.getSourceRetentionReceipt(note.capture_id);
  assert.equal(
    retention.effective_policy.review_completion_event,
    "resource_intake_committed",
  );
  assert.equal(retention.source_access.state, "purged");

  const beta = new TalentSignalClient(baseUrl);
  await beta.login({
    account_slug: "fixture-beta",
    user_email: "recruiter@beta.local",
    client_label: "resource-intake-cross-account-evaluation",
  });
  const betaPeople = await beta.listPeople("周屿");
  assert.equal(betaPeople.people.length, 0);

  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: "multichannel-resource-intake-runtime-proof",
        contract_version: CONTRACT_VERSION,
        captured_at: new Date().toISOString(),
        person: {
          id: note.identity.person_id,
          relationship_context_id:
            note.identity.relationship_context_id,
        },
        inputs: {
          note: note.resource,
          resume: resume.resource,
          duplicate_resume: duplicate.resource,
          public_url: url.resource,
          unresolved_name_only: unresolved.identity,
        },
        compilation: {
          snapshot_id: snapshot.id,
          quality: snapshot.quality,
          block_keys: blockKeys,
        },
        chat: {
          context_manifest_id: chat.context_manifest_id,
          block_kinds: chatKinds,
        },
        retention: {
          state: retention.source_access.state,
          completion_event:
            retention.effective_policy.review_completion_event,
        },
        cross_account: {
          matching_people_visible: betaPeople.people.length,
        },
      },
      null,
      2,
    )}\n`,
  );
}

run().catch((error: unknown) => {
  process.stderr.write(
    `${
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown"
    }\n`,
  );
  process.exitCode = 1;
});
