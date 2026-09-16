import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";

// Synthetic fixtures only. Point API_BASE_URL at an isolated development
// backend; this script never invokes a model or an external effect adapter.
const client = new TalentSignalClient(
  process.env.API_BASE_URL ?? "http://127.0.0.1:4329",
);

async function main(): Promise<void> {
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "web-session-round-trip-fixture",
  });

  const runId = randomUUID();
  const resourceId = `web-session-round-trip:${runId}`;
  const now = new Date().toISOString();
  const request: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `${resourceId}:capture`,
    channel: "chat",
    purpose: "Synthetic Web Session person, evidence, and review round trip",
    captured_at: now,
    source_timezone: "Asia/Shanghai",
    person_scope: {
      status: "new_person",
      display_label: "林珊 · 合成验收",
      relationship_context: {
        status: "proposed",
        label: "产品负责人寻访 · 合成",
        purpose: "Verify the resumable Web Session boundary",
        role: "Candidate",
      },
      binding_basis:
        "The isolated synthetic evaluator explicitly selected this identity.",
    },
    resource: {
      client_resource_id: resourceId,
      kind: "conversation_transcript",
      display_name: "Web Session round-trip synthetic transcript",
      media_type: "text/plain",
      observed_at: now,
      source_timezone: "Asia/Shanghai",
      source_locator: `synthetic:web-session-round-trip:${runId}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    fragments: [
      {
        client_resource_id: resourceId,
        kind: "message",
        sequence: 0,
        text:
          "Location: Shanghai\nWork mode: Hybrid\nDeadline: 2026-09-30",
        locator: {
          kind: "message",
          source_message_id: `web-session-message:${runId}`,
          sequence: 0,
          speaker_side: "left",
        },
        attribution: { actor_kind: "candidate", status: "confirmed" },
        review_status: "reviewed",
        parser: { name: "web-session-round-trip-fixture", version: "1" },
      },
    ],
  };

  const created = await client.createResourceCapture(request);
  assert.equal(created.identity.status, "bound");
  assert(created.identity.person_id);
  assert(created.identity.relationship_context_id);

  const review = await client.prepareCaptureReview(created.capture_id);
  assert.equal(review.claim_proposals.length, 3);
  assert(review.claim_proposals.every((claim) => claim.review_status === "pending"));

  process.stdout.write(
    `${JSON.stringify(
      {
        fixture: "web-session-round-trip",
        run_id: runId,
        person_id: created.identity.person_id,
        relationship_context_id: created.identity.relationship_context_id,
        capture_id: created.capture_id,
        pending_claim_ids: review.claim_proposals.map((claim) => claim.id),
        external_effects: 0,
        model_calls: 0,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Web Session fixture failed: ${
      error instanceof Error ? error.stack ?? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});

