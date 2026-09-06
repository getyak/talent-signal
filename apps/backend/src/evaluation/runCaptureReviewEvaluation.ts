import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION, TalentSignalClient, TalentSignalHttpError,
  type ResourceCaptureRequest, type ResourceClaimProposal } from "@talent-signal/contracts";
import { Pool } from "pg";

// Synthetic fixtures only. DATABASE_URL must name the isolated evaluation database.
const client = new TalentSignalClient(process.env.API_BASE_URL ?? "http://127.0.0.1:4329");
const run = randomUUID();
let counter = 0;
const key = () => `capture-review:${run}:${counter++}`;
async function rejectsCode(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => error instanceof TalentSignalHttpError && error.code === code);
}
async function makeSource(speaker: "candidate" | "unknown" = "candidate", bound = true,
  text = "Location: Shanghai\nWork mode: Hybrid\nDeadline: next Friday") {
  const id = key();
  const request: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION, idempotency_key: id, channel: "ios_share",
    purpose: "Synthetic Capture review regression", captured_at: new Date().toISOString(), source_timezone: "Asia/Shanghai",
    person_scope: bound ? { status: "new_person", display_label: id,
      relationship_context: { status: "proposed", label: "Synthetic search", purpose: "Verify independent review", role: "Candidate" },
      binding_basis: "Explicit synthetic evaluator identity" } : { status: "unresolved", display_name_hint: id, handles: [], reason: "Synthetic identity awaits review" },
    resource: { client_resource_id: id, kind: "conversation_screenshot", display_name: "Synthetic screenshot",
      media_type: "image/png", observed_at: new Date().toISOString(), source_timezone: "Asia/Shanghai",
      retention: { requested_mode: "ephemeral", source_scope: "reviewed_selected_text" } },
    fragments: [{ client_resource_id: id, kind: "message", sequence: 0, text,
      locator: { kind: "message", source_message_id: id, sequence: 0, speaker_side: "unknown" },
      attribution: { actor_kind: speaker, status: speaker === "candidate" ? "confirmed" : "unknown" },
      review_status: "reviewed", parser: { name: "synthetic-review-evaluator", version: "1" } }],
  };
  return client.createResourceCapture(request);
}
function decide(claim: ResourceClaimProposal, decision: "confirm" | "leave_unresolved" | "dismiss", corrected_value?: string) {
  return { idempotency_key: key(), expected_assertion_version: claim.version,
    expected_review_token: claim.review_token!, decision, ...(corrected_value ? { corrected_value } : {}) };
}

async function main() {
  await client.login({ account_slug: "fixture-alpha", user_email: "recruiter@alpha.local", client_label: "capture-review-evaluation" });
  const source = await makeSource();
  const prepared = await Promise.all([client.prepareCaptureReview(source.capture_id), client.prepareCaptureReview(source.capture_id)]);
  assert.equal(prepared[0]!.claim_proposals.length, 3);
  assert.deepEqual(prepared[0]!.claim_proposals.map(c => c.id), prepared[1]!.claim_proposals.map(c => c.id));
  const claim = (field: string) => prepared[0]!.claim_proposals.find(c => c.field === field)!;
  const work = claim("work_mode_preference"), date = claim("decision_deadline"), location = claim("location");
  assert(date.review_blockers?.includes("calendar_date_required"));
  await rejectsCode(() => client.decideAssertion(date.id, decide(date, "confirm", "2026-02-30")), "CALENDAR_DATE_REQUIRED");
  const workRequest = decide(work, "confirm");
  const workReceipt = await client.decideAssertion(work.id, workRequest);
  assert.equal((await client.decideAssertion(work.id, workRequest)).decision_id, workReceipt.decision_id);
  await client.decideAssertion(date.id, decide(date, "leave_unresolved"));
  let current = await client.prepareCaptureReview(source.capture_id);
  assert.equal(current.claim_proposals.filter(c => c.review_status === "confirmed").length, 1);
  assert.equal(current.claim_proposals.filter(c => c.review_status === "unresolved").length, 1);
  assert.equal(current.claim_proposals.find(c => c.id === work.id)?.reviewed_value, "Hybrid");
  await client.decideAssertion(location.id, decide(location, "dismiss"));
  const freshDate = current.claim_proposals.find(c => c.id === date.id)!;
  const finalRequest = decide(freshDate, "confirm", "2026-09-11");
  const finalReceipt = await client.decideAssertion(date.id, finalRequest);
  current = await client.prepareCaptureReview(source.capture_id);
  assert.equal(current.resource.processing_state, "ready");
  assert.equal(current.claim_proposals.find(c => c.id === date.id)?.reviewed_value, "2026-09-11");
  assert.equal((await client.decideAssertion(date.id, finalRequest)).decision_id, finalReceipt.decision_id);

  const unknown = await makeSource("unknown");
  const unknownReview = await client.prepareCaptureReview(unknown.capture_id);
  assert.equal(unknownReview.claim_proposals.length, 0);
  assert.equal(unknownReview.resource.processing_state, "needs_fact_review");
  const fragment = unknownReview.fragments[0]!;
  const author = await client.reviewEvidenceFragment(fragment.id, { idempotency_key: key(),
    expected_review_status: "reviewed", expected_last_review_id: null,
    decision: "reviewed", confirmed_speaker: "candidate", reason: "Synthetic author explicitly checked" });
  let authorReview = await client.prepareCaptureReview(unknown.capture_id);
  assert.equal(authorReview.claim_proposals.length, 3);
  const staleClaim = authorReview.claim_proposals[0]!;
  const rejected = await client.reviewEvidenceFragment(fragment.id, { idempotency_key: key(),
    expected_review_status: "reviewed", expected_last_review_id: author.review_id, decision: "rejected", reason: "Synthetic source correction" });
  await rejectsCode(() => client.decideAssertion(staleClaim.id, decide(staleClaim, "confirm")), "ASSERTION_DELETED");
  await client.reviewEvidenceFragment(fragment.id, { idempotency_key: key(),
    expected_review_status: "rejected", expected_last_review_id: rejected.review_id, decision: "reviewed", reason: "Synthetic source rechecked" });
  await rejectsCode(() => client.decideAssertion(staleClaim.id, decide(staleClaim, "confirm")), "ASSERTION_DELETED");
  authorReview = await client.prepareCaptureReview(unknown.capture_id);
  const activeClaim = authorReview.claim_proposals.find(c => c.field === "location")!;
  const activeRequest = decide(activeClaim, "confirm");
  await client.decideAssertion(activeClaim.id, activeRequest);
  const currentFragment = authorReview.fragments[0]!;
  const invalidated = await client.reviewEvidenceFragment(currentFragment.id, { idempotency_key: key(),
    expected_review_status: "reviewed", expected_last_review_id: currentFragment.last_review_id ?? null,
    decision: "rejected", reason: "Synthetic confirmed evidence was invalidated" });
  const invalidReview = await client.prepareCaptureReview(unknown.capture_id);
  assert.equal(invalidReview.claim_proposals.length, 0);
  await client.reviewEvidenceFragment(currentFragment.id, { idempotency_key: key(), expected_review_status: "rejected",
    expected_last_review_id: invalidated.review_id, decision: "reviewed", reason: "Synthetic evidence was rechecked" });
  authorReview = await client.prepareCaptureReview(unknown.capture_id);
  const renewedClaim = authorReview.claim_proposals.find(c => c.field === "location")!;
  assert.notEqual(renewedClaim.id, activeClaim.id);
  const unauthorizedRequest = decide(renewedClaim, "confirm");

  const unbound = await makeSource("candidate", false);
  await rejectsCode(() => client.prepareCaptureReview(unbound.capture_id), "IDENTITY_REVIEW_REQUIRED");
  const empty = await makeSource("candidate", true, "Thanks for the conversation.");
  const noAction = await client.prepareCaptureReview(empty.capture_id);
  assert.equal(noAction.claim_proposals.length, 0);
  assert.equal(noAction.resource.processing_state, "ready");

  const wrongOwner = await makeSource();
  const beforeCorrection = await client.prepareCaptureReview(wrongOwner.capture_id);
  const oldOwnerClaim = beforeCorrection.claim_proposals.find(c => c.field === "location")!;
  await client.correctCaptureIdentity(wrongOwner.capture_id, {
    idempotency_key: key(), expected_capture_version: beforeCorrection.resource.capture_version,
    expected_person_id: wrongOwner.identity.person_id!, expected_relationship_context_id: wrongOwner.identity.relationship_context_id!,
    reason: "Synthetic wrong-owner correction", binding_basis: "Explicit corrected fixture identity",
    target: { status: "new_person", display_label: key(), relationship_context: { status: "proposed", label: "Corrected search", purpose: "Verify stale ownership" } },
  });
  await rejectsCode(() => client.decideAssertion(oldOwnerClaim.id, decide(oldOwnerClaim, "confirm")), "CLAIM_REVIEW_STALE");

  await client.decideCaptureSourceAuthorization(unknown.capture_id, { idempotency_key: key(),
    expected_capture_version: authorReview.resource.capture_version, decision: "revoke", reason: "Synthetic authorization withdrawal" });
  await rejectsCode(() => client.decideAssertion(renewedClaim.id, unauthorizedRequest), "ASSERTION_SOURCE_AUTHORIZATION_UNAVAILABLE");
  await rejectsCode(() => client.prepareCaptureReview(unknown.capture_id), "SOURCE_AUTHORIZATION_UNAVAILABLE");
  await client.deleteCapture(source.capture_id, { idempotency_key: key(), reason: "Synthetic source deletion" });
  await rejectsCode(() => client.decideAssertion(date.id, finalRequest), "ASSERTION_DELETED");

  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const count = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM fact_decisions WHERE assertion_id = $1", [activeClaim.id]);
      assert.equal(count.rows[0]?.count, 1);
      const state = await pool.query<{ status: string }>("SELECT status FROM confirmed_states WHERE source_assertion_id = $1", [activeClaim.id]);
      assert.equal(state.rows[0]?.status, "retracted");
    } finally { await pool.end(); }
  }
  console.log(JSON.stringify({ status: "passed", scenarios: ["serialized preparation", "partial confirmation",
    "strict date correction", "canonical corrected value", "lost-response replay after ready", "unknown author gate",
    "explicit author review", "stale source and re-review cycle", "rejected confirmed evidence retracts state", "unbound identity gate", "no-action",
    "wrong-owner correction", "revoked source replay", "deleted source replay", "single durable decision"] }, null, 2));
}
await main();
