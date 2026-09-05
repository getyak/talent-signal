import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { LabExperimentRequest } from "@talent-signal/contracts";
import type { AuthContext } from "../modules/auth.js";
import type { RemoteChatAnswerProviding } from "../modules/chatAnswerProvider.js";
import { LabExperimentService } from "../modules/labExperiments.js";

// Explicit disposable, migrated and seeded database only. No remote model calls.
const databaseUrl = process.env.LAB_EXPERIMENT_EVALUATION_DATABASE_URL;
assert(databaseUrl, "Set LAB_EXPERIMENT_EVALUATION_DATABASE_URL to a disposable seeded database.");
assert(["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname));
const pool = new Pool({ connectionString: databaseUrl });
const ids: string[] = [];
const auth: AuthContext = { accountId: "10000000-0000-4000-8000-000000000001",
  accountSlug: "fixture-alpha", userId: "10000000-0000-4000-8000-000000000012",
  userEmail: "reviewer@alpha.local", userKind: "simulated_human", sessionId: randomUUID() };
let calls = 0;
let release: (() => void) | undefined;
let block = new Promise<void>((resolve) => { release = resolve; });
let fail = false;
const provider: RemoteChatAnswerProviding = { providerId: "zhipu-chat-completions", model: "fixture-only",
  supportsImageInput: false, async answer() {
    calls += 1;
    await block;
    if (fail) throw new Error("private upstream error");
    return { provider_id: "zhipu-chat-completions", model: "fixture-only", kind: "clarification", title: "Conflict", body: "Ask for clarification.",
      citation_ids: ["conflict-message-01"], provider_request_id: "synthetic", input_tokens: 1, output_tokens: 1 };
  } };
const service = new LabExperimentService(pool, new Map([[provider.model, provider]]), "fixture-only");
function request(): LabExperimentRequest {
  const id = randomUUID(); ids.push(id);
  return { id, case_id: "conflicting-evidence", models: [provider.model, provider.model] };
}
async function expectStatus(operation: Promise<unknown>, statusCode: number) {
  await assert.rejects(operation, (error: unknown) => Boolean(error && typeof error === "object"
    && "statusCode" in error && error.statusCode === statusCode));
}
async function settle(id: string) {
  for (let i = 0; i < 100; i += 1) {
    const record = await service.read(auth, id);
    if (record.status !== "running") return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Fixture run did not finish.");
}
try {
  const body = request();
  const duplicates = await Promise.all([service.start(auth, body), service.start(auth, body)]);
  assert(duplicates.every((x) => x.id === body.id));
  assert.equal(calls, 1);
  assert.equal((await service.start(auth, { models: body.models, id: body.id, case_id: body.case_id })).id, body.id);
  await expectStatus(service.start(auth, { ...body, case_id: "ambiguous-identity" }), 409);
  await expectStatus(service.start(auth, request()), 409);
  await expectStatus(service.review(auth, body.id, "a"), 409);
  await expectStatus(service.read({ ...auth, userId: "10000000-0000-4000-8000-000000000011" }, body.id), 404);
  await expectStatus(service.read({ ...auth, accountId: "20000000-0000-4000-8000-000000000001" }, body.id), 404);
  release!();
  const completed = await settle(body.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.results.length, 2);
  assert.equal(calls, 2);
  assert.equal(completed.business_write_count, 0);
  await service.start(auth, body);
  assert.equal(calls, 2);
  assert.equal((await service.review(auth, body.id, "needs_review")).review, "needs_review");
  assert.equal((await service.read(auth, body.id)).review, "needs_review");

  await pool.query("UPDATE lab_experiments SET expires_at=now()-interval '1 second' WHERE id=$1", [body.id]);
  await service.scrubExpired();
  await expectStatus(service.start(auth, body), 410);
  assert.equal(calls, 2);
  assert.deepEqual((await pool.query("SELECT record->'results' AS results FROM lab_experiments WHERE id=$1", [body.id])).rows[0].results, []);

  block = Promise.resolve(); fail = true;
  const failed = request();
  await service.start(auth, failed);
  const failure = await settle(failed.id);
  assert.equal(failure.status, "failed");
  assert.equal(calls, 4);
  assert(!JSON.stringify(failure).includes("private upstream"));

  // A lost worker becomes unknown, never a successful or automatically restarted run.
  await pool.query(`UPDATE lab_experiments SET record=jsonb_set(jsonb_set(record,'{status}','"running"'),
    '{created_at}',to_jsonb((now()-interval '3 minutes')::text)) WHERE id=$1`, [failed.id]);
  assert.equal((await service.read(auth, failed.id)).status, "unknown");
  await service.start(auth, failed);
  assert.equal(calls, 4);
  console.log(JSON.stringify({ passed: true, checks: ["concurrent duplicate", "JSON key order independent replay", "settings conflict", "workspace budget",
    "user isolation", "account isolation", "review readback", "expired content scrub", "late replay tombstone",
    "sanitized failure", "unknown completion"], provider_calls: calls, provider: "deterministic test double" }, null, 2));
} finally {
  release?.();
  await pool.query("DELETE FROM lab_experiments WHERE id=ANY($1::uuid[])", [ids]);
  await pool.end();
}
