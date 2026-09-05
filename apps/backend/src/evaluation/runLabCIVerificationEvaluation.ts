import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { LabCIRequest, LabJobRequest, LabRegressionRequest } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import type { AuthContext } from "../modules/auth.js";
import { ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";
import { LabExperimentJobService } from "../modules/labExperimentJobs.js";
import { LabRegressionService } from "../modules/labRegressions.js";
import { LabCIVerificationService } from "../modules/labCIVerifications.js";
import { LabCIVerificationError, type LabCIVerifying, type LabCIVerifiedEvidence } from "../modules/labCIVerifier.js";

const databaseURL = process.env.LAB_CI_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an owned disposable loopback database.");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const jobIDs: string[] = [], regressionIDs: string[] = [], labels: string[] = [], checks: string[] = [];
let fixtureCalls = 0, verifications = 0, denied = false, pause: (() => Promise<void>) | null = null;
const provider = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", fetcher: (async (_url: unknown, init?: RequestInit) => {
  fixtureCalls++; const body = JSON.parse(String(init?.body)), input = JSON.parse(body.messages[1].content);
  return new Response(JSON.stringify({ model: body.model, id: `ci-fixture-${fixtureCalls}`,
    choices: [{ message: { content: JSON.stringify({ kind: "clarification", title: "Synthetic output", body: "Review the unresolved evidence.", citation_ids: input.allowed_citation_ids }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 });
}) as typeof fetch });
const providers = new Map([[provider.model, provider]]), jobs = new LabExperimentJobService(pool, providers, null);
const verifier: LabCIVerifying = { repository: "getyak/talent-signal", trustDigest: "sha256:" + "a".repeat(64), async verify(_bundle, _job, runId) {
  verifications++; if (pause) await pause(); if (denied) throw new LabCIVerificationError("LAB_CI_WORKFLOW_CHANGED");
  const evidence: LabCIVerifiedEvidence = { repository: this.repository, runId, runAttempt: 2, jobId: 456, artifactId: 789,
    artifactDigest: "sha256:" + "b".repeat(64), reportDigest: "sha256:" + "c".repeat(64), sourceRevision: "d".repeat(40),
    artifactExpiresAt: new Date(Date.now() + 3600_000).toISOString(), integrity: "pass", workflowConclusion: "success", jobConclusion: "success" };
  return evidence;
} };
const ci = new LabCIVerificationService(pool, jobs, verifier), regressions = new LabRegressionService(pool, jobs, ci);
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: provider, labProviders: providers, labJobWorkerEnabled: false, labCIVerifier: verifier, personResearchProvider: null });
async function login(slug: string, email: string) {
  const label = "ci-proof-" + randomUUID(); labels.push(label);
  const response = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: { account_slug: slug, user_email: email, client_label: label } });
  assert.equal(response.statusCode, 200, response.body); const value = response.json();
  const auth: AuthContext = { accountId: value.account.id, accountSlug: slug, userId: value.user.id, userEmail: email, userKind: value.user.kind, sessionId: randomUUID() };
  return { auth, headers: { authorization: `Bearer ${value.access_token}` } };
}
function job(overrides: Partial<LabJobRequest> = {}): LabJobRequest {
  const id = randomUUID(); jobIDs.push(id);
  return { id, catalog_revision: jobs.catalogRevision, case_ids: ["conflicting-evidence"],
    configurations: [{ model: provider.model, prompt_preset: "baseline" }, { model: provider.model, prompt_preset: "concise" }], repetitions: 1, call_limit: 2, ...overrides };
}
async function rejects(operation: Promise<unknown>, expected: number) {
  await assert.rejects(operation, (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === expected));
}
function gate() {
  let started!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; }), wait = new Promise<void>((resolve) => { release = resolve; });
  pause = async () => { started(); await wait; };
  return { entered, release: () => { release(); pause = null; } };
}
try {
  const a = await login("fixture-alpha", "reviewer@alpha.local"), b = await login("fixture-beta", "recruiter@beta.local");
  const initial = job(); await jobs.start(a.auth, initial); await jobs.tick(); await jobs.waitForIdle(); const source = await jobs.read(a.auth, initial.id);
  async function savedRerun() {
    const request: LabRegressionRequest = { id: randomUUID(), source_job_id: source.id, source_attempt_id: source.attempts[0]!.id,
      source_definition_hash: source.definition_hash, failure_categories: ["missed_uncertainty"], expected_behavior: "Preserve uncertainty", review_note: "Synthetic only" };
    regressionIDs.push(request.id); const saved = await regressions.save(a.auth, request);
    const rerun = job({ regression_source: { id: saved.id, content_hash: saved.content_hash } });
    await jobs.start(a.auth, rerun); await jobs.tick(); await jobs.waitForIdle();
    const verification: LabCIRequest = { id: randomUUID(), regression_content_hash: saved.content_hash, job_id: rerun.id, github_run_id: 123 };
    return { saved, rerun, verification };
  }
  const { saved, rerun, verification } = await savedRerun();
  assert.equal(saved.ci?.available, true); assert.equal(saved.release_check, "not_connected");
  await rejects(new LabCIVerificationService(pool, jobs, null).verify(a.auth, saved.id, verification), 503);
  await rejects(ci.verify(b.auth, saved.id, verification), 404);
  await rejects(ci.verify(a.auth, saved.id, { ...verification, job_id: source.id }), 409);
  assert.equal(verifications, 0); checks.push("unconfigured, wrong owner and unrelated run cannot call verifier");
  const response = await app.inject({ method: "POST", url: `/v1/lab/regressions/${saved.id}/ci-verifications`, headers: a.headers, payload: verification });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers["cache-control"], "no-store");
  const receipt = response.json().verification;
  assert.equal(receipt.state, "verified"); assert.equal(receipt.release_enforcement, "not_verified"); assert.equal(receipt.quality, "needs_review");
  assert(Date.parse(receipt.valid_until) - Date.parse(receipt.checked_at) <= 15 * 60_000);
  assert.equal((await regressions.read(a.auth, saved.id)).release_check, "ci_verified");
  assert.equal((await regressions.list(a.auth)).find((value) => value.id === saved.id)?.release_check, "ci_verified");
  const readback = await app.inject({ method: "GET", url: `/v1/lab/regressions/${saved.id}`, headers: a.headers });
  assert.equal(readback.statusCode, 200, readback.body); assert.deepEqual(readback.json().regression.ci.latest, receipt);
  const list = await app.inject({ method: "GET", url: "/v1/lab/regressions", headers: a.headers });
  assert.equal(list.statusCode, 200); assert.equal(list.json().regressions.find((value: { id: string }) => value.id === saved.id).release_check, "ci_verified");
  checks.push("authenticated route persists exact receipt; detail and summary readback agree; bounded freshness and separate authority");
  assert.deepEqual(await ci.verify(a.auth, saved.id, verification), receipt); assert.equal(verifications, 1);
  assert.deepEqual(await ci.read(a.auth, saved.id, verification.id), receipt);
  await rejects(ci.verify(a.auth, saved.id, { ...verification, github_run_id: 999 }), 409);
  await rejects(ci.read(b.auth, saved.id, verification.id), 404);
  await rejects(ci.read({ ...a.auth, userId: randomUUID() }, saved.id, verification.id), 404);
  checks.push("stable-ID replay and lost response readback; changed request and cross-account/user denial");
  const trustChanged = new LabCIVerificationService(pool, jobs, { ...verifier, trustDigest: "sha256:" + "e".repeat(64) });
  assert.equal((await trustChanged.states(a.auth, [saved.id])).get(saved.id)?.releaseCheck, "ci_needs_refresh");
  assert.equal((await new LabCIVerificationService(pool, jobs, null).states(a.auth, [saved.id])).get(saved.id)?.releaseCheck, "ci_needs_refresh");
  await pool.query("UPDATE lab_ci_verifications SET receipt=jsonb_set(receipt,'{valid_until}',to_jsonb((now()-interval '1 second')::text)) WHERE id=$1", [verification.id]);
  assert.equal((await regressions.read(a.auth, saved.id)).release_check, "ci_needs_refresh");
  checks.push("changed trust, disabled verifier and database expiry invalidate current status");
  denied = true;
  const rejection = await ci.verify(a.auth, saved.id, { ...verification, id: randomUUID() });
  assert.equal(rejection.state, "not_verified"); assert.equal(rejection.reason_code, "LAB_CI_WORKFLOW_CHANGED");
  assert.equal(rejection.report_digest, null); assert.equal((await regressions.read(a.auth, saved.id)).release_check, "not_connected"); denied = false;
  checks.push("negative verification is explicit and supersedes earlier success");
  const deleting = await savedRerun(), deletionGate = gate();
  const pending = ci.verify(a.auth, deleting.saved.id, deleting.verification); await deletionGate.entered;
  await regressions.remove(a.auth, deleting.saved.id); deletionGate.release(); await rejects(pending, 410);
  assert.equal((await pool.query("SELECT count(*) FROM lab_ci_verifications WHERE id=$1", [deleting.verification.id])).rows[0].count, "0");
  checks.push("source deletion during external read cannot resurrect proof");
  const expiring = await savedRerun(), expiryGate = gate();
  const expired = ci.verify(a.auth, expiring.saved.id, expiring.verification); await expiryGate.entered;
  await pool.query("UPDATE lab_experiment_jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [expiring.rerun.id]);
  expiryGate.release(); await rejects(expired, 410); checks.push("rerun expiry during verification cannot create a receipt");
  await regressions.remove(a.auth, saved.id);
  await rejects(ci.read(a.auth, saved.id, verification.id), 410); await rejects(ci.verify(a.auth, saved.id, verification), 410);
  assert((await pool.query("SELECT receipt FROM lab_ci_verifications WHERE regression_id=$1", [saved.id])).rows.every((row) => row.receipt === null));
  checks.push("deletion scrubs all receipt payloads; replay remains tombstoned");
  console.log(JSON.stringify({ passed: true, hosted_ci_verified: false, external_model_calls: 0, fixture_model_calls: fixtureCalls, fixture_verifications: verifications, checks }, null, 2));
} finally {
  await jobs.close(); await app.close();
  await pool.query("DELETE FROM lab_ci_verifications WHERE regression_id=ANY($1::uuid[])", [regressionIDs]);
  await pool.query("DELETE FROM lab_experiment_jobs WHERE id=ANY($1::uuid[])", [jobIDs]);
  await pool.query("DELETE FROM lab_regressions WHERE id=ANY($1::uuid[])", [regressionIDs]);
  await pool.query("DELETE FROM sessions WHERE client_label=ANY($1::text[])", [labels]); await pool.end();
}
