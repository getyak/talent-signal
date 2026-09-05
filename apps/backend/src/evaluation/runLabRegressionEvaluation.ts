import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import type { LabJobRequest, LabRegressionRequest } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import type { AuthContext } from "../modules/auth.js";
import { ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";
import { LabExperimentJobService } from "../modules/labExperimentJobs.js";
import { LabRegressionService, scrubExpiredRegressions } from "../modules/labRegressions.js";
import { labHash } from "../modules/labJobCases.js";

const databaseURL = process.env.LAB_REGRESSION_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an owned disposable loopback database.");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const jobIDs: string[] = [], regressionIDs: string[] = [], labels: string[] = [], calls: string[] = [];
const releases: Array<() => void> = [];
let paused: { started: () => void; gate: Promise<void> } | null = null;
function pauseNext() {
  let started!: () => void, release!: () => void;
  const wait = new Promise<void>((resolve) => { started = resolve; });
  paused = { started, gate: new Promise<void>((resolve) => { release = resolve; }) }; releases.push(release);
  return { wait, release };
}
const provider = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", fetcher: (async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)), input = JSON.parse(body.messages[1].content);
  calls.push(body.messages[1].content);
  if (paused) { const current = paused; paused = null; current.started(); await current.gate; }
  return new Response(JSON.stringify({ model: body.model, id: "regression-fixture-" + calls.length,
    choices: [{ message: { content: JSON.stringify({ kind: "clarification", title: "Synthetic output", body: "Review the unresolved evidence.", citation_ids: input.allowed_citation_ids }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 });
}) as typeof fetch });
const providers = new Map([[provider.model, provider]]);
const jobs = new LabExperimentJobService(pool, providers, process.env.GITHUB_SHA ?? null), service = new LabRegressionService(pool, jobs);
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: provider, labProviders: providers, labJobWorkerEnabled: false, personResearchProvider: null });
async function login(slug: string, email: string) {
  const label = "regression-proof-" + randomUUID(); labels.push(label);
  const response = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: { account_slug: slug, user_email: email, client_label: label } });
  assert.equal(response.statusCode, 200);
  const value = response.json();
  const auth: AuthContext = { accountId: value.account.id, accountSlug: slug, userId: value.user.id, userEmail: email, userKind: value.user.kind, sessionId: randomUUID() };
  return { auth, headers: { authorization: `Bearer ${value.access_token}` } };
}
function job(overrides: Partial<LabJobRequest> = {}): LabJobRequest {
  const id = randomUUID(); jobIDs.push(id);
  return { id, catalog_revision: jobs.catalogRevision, case_ids: ["conflicting-evidence"],
    configurations: [{ model: provider.model, prompt_preset: "baseline" }, { model: provider.model, prompt_preset: "concise" }],
    repetitions: 1, call_limit: 2, ...overrides };
}
function saveRequest(source: Awaited<ReturnType<typeof jobs.read>>): LabRegressionRequest {
  const id = randomUUID(); regressionIDs.push(id);
  return { id, source_job_id: source.id, source_attempt_id: source.attempts[0]!.id, source_definition_hash: source.definition_hash,
    failure_categories: ["missed_uncertainty"], expected_behavior: "Expected-only marker: retain every unresolved conflict.", review_note: "Review-only marker: this is a synthetic reviewer observation." };
}
async function rejects(operation: Promise<unknown>, expected: number) {
  await assert.rejects(operation, (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === expected));
}
try {
  const a = await login("fixture-alpha", "reviewer@alpha.local"), b = await login("fixture-beta", "recruiter@beta.local");
  const initial = job(); const queued = await jobs.start(a.auth, initial);
  await rejects(service.save(a.auth, saveRequest(queued)), 409);
  await jobs.tick(); await jobs.waitForIdle();
  const source = await jobs.read(a.auth, initial.id), request = saveRequest(source);
  const response = await app.inject({ method: "POST", url: "/v1/lab/regressions", headers: a.headers, payload: request });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["cache-control"], "no-store");
  const saved = await service.read(a.auth, request.id);
  assert.equal(saved.content_hash, labHash(saved.snapshot));
  assert.equal(saved.release_check, "not_connected");
  assert.equal(saved.snapshot.source_attempt.id, request.source_attempt_id);
  assert.deepEqual((await service.save(a.auth, request)).snapshot, saved.snapshot);
  await rejects(service.save(a.auth, { ...request, expected_behavior: "changed" }), 409);
  await rejects(service.read(b.auth, saved.id), 404);
  await rejects(service.read({ ...a.auth, userId: randomUUID() }, saved.id), 404);
  const summary = await app.inject({ method: "GET", url: "/v1/lab/regressions", headers: a.headers });
  assert.equal(summary.statusCode, 200); assert(!summary.body.includes("source_attempt"));
  const archive = await app.inject({ method: "GET", url: `/v1/lab/regressions/${saved.id}/export`, headers: a.headers });
  assert.equal(archive.statusCode, 200); assert.equal(archive.json().execution_authority, "none");
  assert.equal(archive.json().content_hash, saved.content_hash);

  // A human-selected quality snapshot has its own explicit retention, independent of the original batch's seven days.
  await pool.query("UPDATE lab_experiment_jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [source.id]);
  await jobs.scrubExpired(); assert.equal((await service.read(a.auth, saved.id)).content_hash, saved.content_hash);
  const rerun = job({ regression_source: { id: saved.id, content_hash: saved.content_hash } });
  await rejects(jobs.start(a.auth, { ...rerun, regression_source: { ...rerun.regression_source!, content_hash: "0".repeat(64) } }), 409);
  await jobs.start(a.auth, rerun); await jobs.tick(); await jobs.waitForIdle();
  const replay = await jobs.read(a.auth, rerun.id);
  assert.equal(replay.status, "completed"); assert.equal(replay.definition.cases[0]!.input_json, saved.snapshot.case.input_json);
  assert.equal(replay.definition.cases[0]!.input_hash, saved.snapshot.case.input_hash);
  assert.equal(replay.definition.reference_time, saved.snapshot.reference_time);
  assert.equal(replay.definition.regression_source?.content_hash, saved.content_hash);
  assert(calls.every((input) => !input.includes("Expected-only marker") && !input.includes("Review-only marker")));
  // This disposable integration fixture is explicitly synthetic. Only its metadata-only
  // consumption report is uploaded by CI; these content files remain local to the runner.
  const proofDirectory = process.env.LAB_REGRESSION_PROOF_OUTPUT_DIR;
  if (proofDirectory) {
    await mkdir(proofDirectory, { recursive: true, mode: 0o700 });
    await writeFile(join(proofDirectory, "bundle.json"), archive.body, { flag: "wx", mode: 0o600 });
    await writeFile(join(proofDirectory, "run.json"), JSON.stringify(replay), { flag: "wx", mode: 0o600 });
  }
  assert.equal((await service.read(a.auth, saved.id)).reruns[0]?.id, replay.id);
  const beforeDuplicate = calls.length; await jobs.start(a.auth, rerun); assert.equal(calls.length, beforeDuplicate);

  const child = await service.save(a.auth, saveRequest(replay));
  const childRun = job({ regression_source: { id: child.id, content_hash: child.content_hash } }), gate = pauseNext();
  await jobs.start(a.auth, childRun); await jobs.tick(); await gate.wait;
  const deletion = await app.inject({ method: "DELETE", url: `/v1/lab/regressions/${saved.id}`, headers: a.headers });
  assert.equal(deletion.statusCode, 200, deletion.body);
  const receipt = deletion.json(); assert(receipt.affected_job_ids.includes(childRun.id)); assert(receipt.affected_job_ids.includes(rerun.id));
  gate.release(); await jobs.waitForIdle();
  assert.deepEqual(await service.remove(a.auth, saved.id), receipt);
  await rejects(service.read(a.auth, saved.id), 410); await rejects(service.read(a.auth, child.id), 410);
  await rejects(service.save(a.auth, request), 410); await rejects(jobs.start(a.auth, rerun), 410);
  await rejects(jobs.read(a.auth, childRun.id), 410);
  assert.equal((await pool.query("SELECT count(*) FROM lab_experiment_attempts WHERE job_id=ANY($1::uuid[])", [[rerun.id, childRun.id]])).rows[0].count, "0");
  assert((await pool.query("SELECT snapshot FROM lab_regressions WHERE id=ANY($1::uuid[])", [[saved.id, child.id]])).rows.every((value) => value.snapshot === null));

  const expirySource = job(); await jobs.start(a.auth, expirySource); await jobs.tick(); await jobs.waitForIdle();
  const expiring = await service.save(a.auth, saveRequest(await jobs.read(a.auth, expirySource.id)));
  const expiryRun = job({ regression_source: { id: expiring.id, content_hash: expiring.content_hash } });
  await jobs.start(a.auth, expiryRun);
  await pool.query("UPDATE lab_regressions SET expires_at=now()-interval '1 second' WHERE id=$1", [expiring.id]);
  const beforeExpiry = calls.length;
  await jobs.tick(); await jobs.waitForIdle(); assert.equal(calls.length, beforeExpiry);
  await rejects(service.read(a.auth, expiring.id), 410);
  await scrubExpiredRegressions(pool);
  assert.equal((await pool.query("SELECT snapshot FROM lab_regressions WHERE id=$1", [expiring.id])).rows[0].snapshot, null);
  assert(!(await service.list(a.auth)).some((value) => value.id === expiring.id));

  const disabled = await buildApp({ pool, config: { ...config, internalLabEnabled: false }, remoteChatProvider: provider, labProviders: providers, labJobWorkerEnabled: false, personResearchProvider: null });
  try { assert.equal((await disabled.inject({ method: "GET", url: "/v1/lab/regressions", headers: a.headers })).statusCode, 403); }
  finally { await disabled.close(); }
  console.log(JSON.stringify({ passed: true, external_model_calls: 0, fixture_requests: calls.length, checks: [
    "active source cannot be promoted", "exact attempt and definition binding", "immutable snapshot digest", "stable-ID save replay", "changed save conflict",
    "account and user isolation", "small history projection", "review does not assert CI enforcement", "export has no execution authority",
    "explicit saved retention outlives source batch", "tampered rerun binding rejected", "rerun preserves input and reference time",
    "expected behavior and notes withheld from model", "rerun appears under source", "duplicate rerun does not redispatch",
    "parent deletion includes derived cases and runs", "deletion during provider dispatch rejects late output", "idempotent deletion receipt",
    "deleted save and run IDs cannot revive content", "deletion scrubs attempts and snapshots", "expired source blocks unissued calls", "expiry scrubs content", "disabled capability denied",
  ] }, null, 2));
} finally {
  releases.forEach((release) => release()); await jobs.close(); await app.close();
  await pool.query("DELETE FROM lab_experiment_jobs WHERE id=ANY($1::uuid[])", [jobIDs]);
  await pool.query("DELETE FROM lab_regressions WHERE id=ANY($1::uuid[])", [regressionIDs]);
  await pool.query("DELETE FROM sessions WHERE client_label=ANY($1::text[])", [labels]); await pool.end();
}
