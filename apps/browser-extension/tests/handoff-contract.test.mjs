import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandoffEnvelope,
  classifyReceiptResponse,
  classifyTransportError,
  createRequestIdentity,
  normalizeLocalOrigin,
  sessionCopy,
} from "../load-unpacked/lib/handoff-contract.js";
import {
  fixtureCheck,
  fixtureSubmit,
} from "../load-unpacked/lib/fixture-transport.js";

const draft = {
  id: "draft-1",
  kind: "selected_text",
  source: {
    title: "Conversation",
    url: "https://example.test/conversation",
    captured_at: "2026-08-05T09:00:00.000Z",
  },
};

function envelope() {
  const requestIdentity = createRequestIdentity(draft.id, () => "request-1");
  return buildHandoffEnvelope({
    draft,
    reviewedAsset: {
      type: "reviewed_text",
      text: "Exact reviewed excerpt",
      edited_from_selection: false,
    },
    retentionMode: "ephemeral",
    requestIdentity,
    handoffTarget: "http://localhost:3000",
    sessionVersion: "session-version-4",
    approvedAt: "2026-08-05T09:01:00.000Z",
  });
}

test("accepts only localhost development origins", () => {
  assert.equal(
    normalizeLocalOrigin("http://localhost:3000/path"),
    "http://localhost:3000",
  );
  assert.equal(
    normalizeLocalOrigin("http://127.0.0.1:4173"),
    "http://127.0.0.1:4173",
  );
  assert.throws(() => normalizeLocalOrigin("https://localhost:3000"));
  assert.throws(() => normalizeLocalOrigin("http://talent-signal.example"));
});

test("separates observed source, reviewed asset, authorization, and receipt", () => {
  const result = envelope();
  assert.equal(result.source.capture_kind, "selected_text");
  assert.equal(result.review.type, "reviewed_text");
  assert.equal(result.authorization.decision, "submit_reviewed_capture");
  assert.equal(result.idempotency_key, "browser-capture:draft-1:request-1");
  assert.equal(result.handoff_target, "http://localhost:3000");
  assert.deepEqual(result.session, {
    version: "session-version-4",
    credential_transport: "browser_managed",
  });
  assert.equal("receipt" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /cookie|bearer|password|token/i);
});

test("classifies pending, received, duplicate, stale, and invalid responses truthfully", () => {
  assert.equal(
    classifyReceiptResponse(202, { status: "pending" }).state,
    "pending",
  );
  assert.equal(
    classifyReceiptResponse(202, {
      status: "received",
      receipt_id: "receipt-1",
    }).state,
    "received",
  );
  const duplicate = classifyReceiptResponse(409, {
    status: "received",
    code: "duplicate",
    receipt_id: "receipt-1",
  });
  assert.equal(duplicate.state, "received");
  assert.equal(duplicate.duplicate, true);
  assert.equal(
    classifyReceiptResponse(409, { code: "session_stale" }).code,
    "session_stale",
  );
  assert.equal(classifyReceiptResponse(500, {}).state, "failed");
  assert.equal(classifyReceiptResponse(204, {}).state, "unknown");
});

test("treats a timeout as unknown and an unreachable service as failed", () => {
  assert.equal(
    classifyTransportError(new DOMException("timeout", "AbortError")).state,
    "unknown",
  );
  assert.equal(classifyTransportError(new TypeError("offline")).state, "failed");
});

test("retries offline with the same idempotency key and prevents duplicate creation", async () => {
  const packet = envelope();
  await assert.rejects(
    fixtureSubmit({ envelope: packet, scenario: "offline", attempt: 1 }),
    /offline/i,
  );
  const retried = await fixtureSubmit({
    envelope: packet,
    scenario: "offline",
    attempt: 2,
  });
  assert.equal(retried.state, "received");

  const duplicate = await fixtureSubmit({
    envelope: packet,
    scenario: "duplicate",
  });
  assert.equal(duplicate.state, "received");
  assert.equal(duplicate.duplicate, true);
  assert.equal(packet.idempotency_key, "browser-capture:draft-1:request-1");
});

test("reconciles an unknown fixture receipt without resubmitting", async () => {
  const packet = envelope();
  await assert.rejects(
    fixtureSubmit({
      envelope: packet,
      scenario: "unknown_then_received",
    }),
    (error) => error.name === "AbortError",
  );
  const reconciled = await fixtureCheck({
    requestId: packet.request_id,
    scenario: "unknown_then_received",
  });
  assert.equal(reconciled.state, "received");
});

test("requires an observable ready session and never exposes a credential", () => {
  const ready = sessionCopy(200, {
    status: "ready",
    workspace_label: "Fixture workspace",
    session_version: "version-4",
    token: "must-not-be-copied",
  });
  assert.deepEqual(ready, {
    state: "ready",
    workspace_label: "Fixture workspace",
    session_version: "version-4",
    message:
      "Browser-managed local session is ready. No token is exposed to the extension.",
  });
  assert.equal(sessionCopy(401, {}).state, "not_ready");
});
