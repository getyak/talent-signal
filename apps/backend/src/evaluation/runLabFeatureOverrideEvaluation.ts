import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
  type LabFeatureOverrideRequest,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";
import { LabFeatureOverrideService } from "../modules/labFeatureOverrides.js";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4330";
const databaseUrl = process.env.DATABASE_URL;

async function expectHttp(code: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.code, code);
  }
}

async function main(): Promise<void> {
  assert(databaseUrl, "DATABASE_URL is required for persisted receipt proof.");
  const run = randomUUID();
  const alpha = new TalentSignalClient(baseUrl);
  const alphaSession = await alpha.login({ account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local", client_label: `lab-feature-alpha-${run}` });
  const sibling = new TalentSignalClient(baseUrl);
  await sibling.login({ account_slug: "fixture-alpha", user_email: "recruiter@alpha.local",
    client_label: `lab-feature-sibling-${run}` });

  const initial = await alpha.getLabFeatureConfiguration();
  assert.equal(initial.features.length, 1);
  assert.equal(initial.features[0]?.server_value, "source_only");
  assert.deepEqual(initial.overrides, []);

  const firstRequest: LabFeatureOverrideRequest = { id: randomUUID(),
    feature_id: "relationship_evidence_preview", value: "inline_excerpt",
    duration_minutes: 15, replaces_override_id: null };
  const first = (await alpha.startLabFeatureOverride(firstRequest)).override;
  assert.equal(first.status, "active");
  assert.equal(first.effective_value, "inline_excerpt");
  assert.equal((await alpha.startLabFeatureOverride(firstRequest)).override.id, first.id);
  await expectHttp("LAB_FEATURE_OVERRIDE_ID_CONFLICT", () => alpha.startLabFeatureOverride({
    ...firstRequest, duration_minutes: 30,
  }));
  assert.deepEqual((await sibling.getLabFeatureConfiguration()).overrides, []);
  await expectHttp("LAB_FEATURE_OVERRIDE_NOT_FOUND", () => sibling.getLabFeatureOverride(first.id));

  const secondRequest: LabFeatureOverrideRequest = { ...firstRequest, id: randomUUID(),
    replaces_override_id: first.id };
  const second = (await alpha.startLabFeatureOverride(secondRequest)).override;
  assert.equal(second.status, "active");
  assert.equal((await alpha.getLabFeatureOverride(first.id)).override.stop_reason, "replaced");

  const now = new Date().toISOString();
  const clientResourceId = `lab-feature-source-${run}`;
  const captureRequest: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `lab-feature:${run}:capture`,
    channel: "chat",
    purpose: "Synthetic feature-adoption proof",
    captured_at: now,
    source_timezone: "Asia/Shanghai",
    person_scope: {
      status: "new_person",
      display_label: `Lab Feature ${run.slice(0, 6)}`,
      relationship_context: { status: "proposed", label: "Synthetic feature proof",
        purpose: "Verify session-scoped evidence presentation", role: "Candidate" },
      binding_basis: "The evaluator created one synthetic person and relationship.",
    },
    resource: { client_resource_id: clientResourceId, kind: "conversation_transcript",
      display_name: "Synthetic reviewed conversation", media_type: "text/plain",
      observed_at: now, source_timezone: "Asia/Shanghai",
      source_locator: `synthetic:lab-feature:${run}`,
      retention: { requested_mode: "ephemeral", source_scope: "reviewed_selected_text" } },
    fragments: [{ client_resource_id: clientResourceId, kind: "message", sequence: 0,
      text: "I can speak on Tuesday afternoon, but I have not confirmed a meeting.",
      locator: { kind: "message", source_message_id: `lab-feature-${run}`, sequence: 0,
        speaker_side: "left" }, attribution: { actor_kind: "candidate", status: "confirmed" },
      review_status: "proposed", parser: { name: "lab-feature-proof", version: "1.0.0" } }],
  };
  const capture = await alpha.createResourceCapture(captureRequest);
  assert(capture.identity.person_id && capture.identity.relationship_context_id);
  const detail = await alpha.getRelationshipResource(capture.resource.id);
  const fragment = detail.fragments[0];
  assert(fragment);
  await alpha.reviewEvidenceFragment(fragment.id, { idempotency_key: `lab-feature:${run}:review`,
    expected_review_status: "proposed", expected_last_review_id: null, decision: "reviewed",
    reason: "The evaluator compared the exact synthetic source." });
  const wiki = await alpha.compileKnowledge(capture.identity.person_id, capture.identity.relationship_context_id,
    { idempotency_key: `lab-feature:${run}:wiki`, objective: "Prepare the next conversation" });
  assert.equal(wiki.status, "published");
  assert.equal(wiki.quality.verdict, "gold");

  const chatOne = await alpha.createChatTask({ idempotency_key: `lab-feature:${run}:chat-one`,
    objective: "Prepare the next conversation", person_id: capture.identity.person_id,
    relationship_context_id: capture.identity.relationship_context_id });
  const readbackOne = await alpha.getChatTaskReadback(chatOne.task_id);
  assert.equal(readbackOne.lab_feature_receipt?.override_id, second.id);
  assert.equal(readbackOne.lab_feature_receipt?.effective_value, "inline_excerpt");
  assert(readbackOne.citations.some((citation) => citation.exact_excerpt?.includes("Tuesday afternoon")));

  const stopped = (await alpha.stopLabFeatureOverride(second.id)).override;
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.stop_reason, "manual");
  const replayedStop = (await alpha.stopLabFeatureOverride(second.id)).override;
  assert.equal(replayedStop.status, "stopped");

  const chatTwo = await alpha.createChatTask({ idempotency_key: `lab-feature:${run}:chat-two`,
    objective: "Prepare a second view", person_id: capture.identity.person_id,
    relationship_context_id: capture.identity.relationship_context_id });
  const readbackTwo = await alpha.getChatTaskReadback(chatTwo.task_id);
  assert.equal(readbackTwo.lab_feature_receipt, undefined);
  assert.equal((await alpha.getChatTaskReadback(chatOne.task_id)).lab_feature_receipt?.override_id, second.id);

  const third = (await alpha.startLabFeatureOverride({ ...firstRequest, id: randomUUID(),
    replaces_override_id: null })).override;
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const session = await pool.query<{ id: string }>(
      `SELECT id FROM sessions WHERE account_id=$1 AND user_id=$2 AND client_label=$3 ORDER BY created_at DESC LIMIT 1`,
      [alphaSession.account.id, alphaSession.user.id, `lab-feature-alpha-${run}`]);
    assert(session.rows[0]);
    const drift = new LabFeatureOverrideService(pool, "proof-revision-b");
    const drifted = await drift.configuration({ accountId: alphaSession.account.id,
      accountSlug: alphaSession.account.slug, userId: alphaSession.user.id, userEmail: alphaSession.user.email,
      userKind: alphaSession.user.kind, sessionId: session.rows[0].id }, true);
    const thirdAfterDrift = drifted.overrides.find((item) => item.id === third.id);
    assert.equal(thirdAfterDrift?.status, "stopped");
    assert.equal(thirdAfterDrift?.stop_reason, "configuration_changed");

    const stored = await pool.query<{ record: Record<string, unknown>; receipt: Record<string, unknown> | null }>(
      `SELECT o.record, m.lab_feature_receipt AS receipt FROM lab_feature_overrides o
       CROSS JOIN context_manifests m WHERE o.id=$1 AND m.task_id=$2`, [second.id, chatOne.task_id]);
    assert.equal(stored.rows.length, 1);
    assert.equal("objective" in stored.rows[0]!.record, false);
    assert.equal("evidence" in stored.rows[0]!.record, false);
    assert.equal(stored.rows[0]!.receipt?.override_id, second.id);
  } finally {
    await pool.end();
  }

  process.stdout.write(`${JSON.stringify({ evaluation: "lab_feature_override",
    catalog_revision: initial.catalog_revision, session_isolation: true, idempotent_start: true,
    replacement_verified: true, adopted_override_id: second.id, frozen_receipt: true,
    default_restored_for_new_task: true, configuration_drift_restored_default: true,
    override_record_excludes_objective_and_evidence: true })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Lab feature override evaluation failed: ${error instanceof Error ? error.stack ?? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
