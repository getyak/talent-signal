import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { LabJobRequest } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import type { AuthContext } from "../modules/auth.js";
import { ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";
import { LabExperimentJobService } from "../modules/labExperimentJobs.js";
import { LabExperimentService } from "../modules/labExperiments.js";

const databaseURL = process.env.LAB_JOB_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an explicit disposable loopback database.");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const ids: string[] = [], labels: string[] = [];
const calls: Array<{ model: string; input: string }> = [];
let failure = false;
let gate: { started: () => void; wait: Promise<void> } | null = null;
const releases: Array<() => void> = [];
function pauseNext() {
  let begin!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { begin = resolve; });
  gate = { started: begin, wait: new Promise<void>((resolve) => { release = resolve; }) };
  releases.push(release);
  return { started, release };
}
const fetcher = (async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  calls.push({ model: body.model, input: body.messages[1].content });
  if (gate) { const current = gate; gate = null; current.started(); await current.wait; }
  if (failure) throw new Error("Synthetic private upstream failure");
  const input = JSON.parse(body.messages[1].content);
  return new Response(JSON.stringify({ id: "fixture-" + calls.length, model: body.model,
    choices: [{ message: { content: JSON.stringify({ kind: "clarification", title: "Synthetic answer",
      body: "Please review the evidence before reaching a conclusion.", citation_ids: input.allowed_citation_ids }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 });
}) as typeof fetch;
const provider = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", fetcher });
const providers = new Map([[provider.model, provider]]);
const service = new LabExperimentJobService(pool, providers, null);
const secondWorker = new LabExperimentJobService(pool, providers, null);
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: provider, labProviders: providers, labJobWorkerEnabled: false, personResearchProvider: null });
async function login(account: string, user: string) {
  const label = "lab-job-proof-" + randomUUID(); labels.push(label);
  const response = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: { account_slug: account, user_email: user, client_label: label } });
  assert.equal(response.statusCode, 200);
  const value = response.json();
  const auth: AuthContext = { accountId: value.account.id, accountSlug: value.account.slug, userId: value.user.id,
    userEmail: value.user.email, userKind: value.user.kind, sessionId: randomUUID() };
  return { token: value.access_token as string, auth };
}
function request(overrides: Partial<LabJobRequest> = {}): LabJobRequest {
  const id = randomUUID(); ids.push(id);
  return { id, catalog_revision: service.catalogRevision, case_ids: ["conflicting-evidence"], configurations: [
    { model: provider.model, prompt_preset: "baseline" }, { model: provider.model, prompt_preset: "concise" }], repetitions: 1, call_limit: 2, ...overrides };
}
async function status(operation: Promise<unknown>, expected: number) {
  await assert.rejects(operation, (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === expected));
}
try {
  const a = await login("fixture-alpha", "reviewer@alpha.local"), b = await login("fixture-beta", "recruiter@beta.local");
  await status(service.start(a.auth, request({ catalog_revision: "0".repeat(64) })), 409);
  const first = request({ case_ids: ["conflicting-evidence", "heldout-shared-name"], repetitions: 2, call_limit: 8 });
  const duplicate = await Promise.all([service.start(a.auth, first), service.start(a.auth, first)]);
  assert.equal(duplicate[0]!.definition_hash, duplicate[1]!.definition_hash);
  assert.equal(calls.length, 0);
  assert.equal(duplicate[0]!.attempts.length, 8);
  await status(service.start(a.auth, { ...first, repetitions: 3 }), 409);
  await status(service.start(a.auth, request()), 409);
  const legacy = new LabExperimentService(pool, providers, null);
  await status(legacy.start(a.auth, { id: randomUUID(), case_id: "conflicting-evidence", models: [provider.model, provider.model] }), 409);
  await status(service.read(b.auth, first.id), 404);
  await status(service.read({ ...a.auth, userId: "10000000-0000-4000-8000-000000000011" }, first.id), 404);
  await status(service.review(a.auth, first.id, { review: "a", failure_categories: [] }), 409);
  const catalog = await app.inject({ method: "GET", url: "/v1/lab/experiment-jobs", headers: { authorization: `Bearer ${a.token}` } });
  assert.equal(catalog.statusCode, 200, catalog.body);
  assert.equal(catalog.headers["cache-control"], "no-store");
  assert.equal(catalog.json().jobs[0].planned_calls, 8);
  assert(!("attempts" in catalog.json().jobs[0]), "History must not download every past model answer");
  await Promise.all([service.tick(), secondWorker.tick()]);
  await Promise.all([service.waitForIdle(), secondWorker.waitForIdle()]);
  let completed = await service.read(a.auth, first.id);
  assert.equal(completed.status, "completed"); assert.equal(completed.calls_reserved, 8); assert.equal(calls.length, 8);
  assert.equal(completed.quality, "needs_review");
  assert(completed.attempts.every((value) => value.status === "completed" && value.actual_prompt_revision === value.prompt_revision));
  assert(calls.every((call) => !completed.definition.cases.some((sample) => call.input.includes(sample.expected))));
  providers.clear(); assert.equal((await service.start(a.auth, first)).id, first.id); providers.set(provider.model, provider);
  assert.equal(calls.length, 8);
  assert.equal((await service.review(a.auth, first.id, { review: "inconclusive", failure_categories: ["missed_uncertainty"] })).review, "inconclusive");

  const budget = request({ repetitions: 3, call_limit: 2 });
  await service.start(a.auth, budget); await service.tick(); await service.waitForIdle();
  const bounded = await service.read(a.auth, budget.id);
  assert.equal(bounded.status, "partial"); assert.equal(bounded.calls_reserved, 2);
  assert.equal(bounded.attempts.filter((value) => value.error_code === "CALL_BUDGET_EXHAUSTED").length, 4);

  const queued = request(); await service.start(a.auth, queued);
  const beforeQueuedCancel = calls.length;
  assert.equal((await service.cancel(a.auth, queued.id)).status, "cancelled");
  assert.equal((await service.cancel(a.auth, queued.id)).status, "cancelled");
  await service.tick(); await service.waitForIdle(); assert.equal(calls.length, beforeQueuedCancel);

  const running = request({ repetitions: 3, call_limit: 6 }), paused = pauseNext();
  await service.start(a.auth, running); await service.tick(); await paused.started;
  assert.equal((await service.cancel(a.auth, running.id)).status, "cancelling");
  paused.release(); await service.waitForIdle();
  const cancelled = await service.read(a.auth, running.id);
  assert.equal(cancelled.status, "cancelled"); assert.equal(cancelled.calls_reserved, 1);
  assert.equal(cancelled.attempts.filter((value) => value.status === "completed").length, 1);
  assert.equal(cancelled.attempts.filter((value) => value.status === "cancelled").length, 5);

  const restarting = new LabExperimentJobService(pool, providers, null);
  const resumable = request(), shutdownPause = pauseNext();
  await restarting.start(a.auth, resumable); await restarting.tick(); await shutdownPause.started;
  const stopping = restarting.close(); shutdownPause.release(); await stopping;
  assert.equal((await service.read(a.auth, resumable.id)).status, "queued");
  assert.equal((await service.read(a.auth, resumable.id)).calls_reserved, 1);
  const beforeResume = calls.length;
  await service.tick(); await service.waitForIdle();
  assert.equal((await service.read(a.auth, resumable.id)).status, "completed");
  assert.equal(calls.length, beforeResume + 1);

  const lost = request(), uncertain = pauseNext();
  await service.start(a.auth, lost); await service.tick(); await uncertain.started;
  await pool.query("UPDATE lab_experiment_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [lost.id]);
  await secondWorker.recoverStale();
  assert.equal((await service.read(a.auth, lost.id)).status, "unknown");
  const beforeRecovery = calls.length;
  uncertain.release(); await service.waitForIdle(); await secondWorker.tick(); await secondWorker.waitForIdle();
  const unknown = await service.start(a.auth, lost);
  assert.equal(unknown.status, "unknown"); assert.equal(unknown.attempts[0]!.status, "unknown"); assert.equal(calls.length, beforeRecovery);

  failure = true;
  const bad = request(); await service.start(a.auth, bad); await service.tick(); await service.waitForIdle();
  const failed = await service.read(a.auth, bad.id); assert.equal(failed.status, "failed"); assert.equal(failed.quality, "blocked");
  assert(!JSON.stringify(failed).includes("private upstream")); failure = false;
  const dailyWorker = new LabExperimentJobService(pool, providers, null, 2);
  const daily = request(); await dailyWorker.start(a.auth, daily); await dailyWorker.tick(); await dailyWorker.waitForIdle();
  assert.equal((await dailyWorker.read(a.auth, daily.id)).calls_reserved, 0); await dailyWorker.close();

  await pool.query("UPDATE lab_experiment_jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [first.id]);
  await service.scrubExpired();
  const systemNow = Date.now;
  try {
    // Worker leases, scrubbing, readback and cancellation share the database clock.
    // Even an API clock one minute behind cannot revive scrubbed content.
    Date.now = () => systemNow() - 60_000;
    await status(service.start(a.auth, first), 410);
    await status(service.cancel(a.auth, first.id), 410);
  } finally { Date.now = systemNow; }
  assert.deepEqual((await pool.query("SELECT definition->'cases' AS cases FROM lab_experiment_jobs WHERE id=$1", [first.id])).rows[0].cases, []);
  assert.equal((await pool.query("SELECT count(*) FROM lab_experiment_attempts WHERE job_id=$1", [first.id])).rows[0].count, "0");
  const forbidden = await app.inject({ method: "GET", url: `/v1/lab/experiment-jobs/${bad.id}`, headers: { authorization: `Bearer ${b.token}` } });
  assert.equal(forbidden.statusCode, 404);
  console.log(JSON.stringify({ passed: true, remote_network_calls: 0, fixture_requests: calls.length,
    checks: ["stale catalog rejected before dispatch", "committed frozen definition", "duplicate start", "settings conflict", "workspace and legacy exclusion", "account isolation", "user isolation",
      "small history metadata", "two workers cannot duplicate dispatch", "interleaved case repetitions", "actual prompt identity", "expected behavior withheld",
      "replay after catalog change", "persisted review", "per-job call budget", "queued cancellation", "in-flight cancellation preserves completed output",
      "graceful shutdown resumes only unissued attempts", "lost lease becomes unknown", "late result cannot overwrite unknown", "unknown is never paid-retried", "sanitized provider failure",
      "daily workspace batch budget", "expired content scrub", "expired ID never restarts", "database expiry overrides a slow API clock"] }, null, 2));
} finally {
  releases.forEach((release) => release());
  await service.close(); await secondWorker.close(); await app.close();
  await pool.query("DELETE FROM lab_experiment_jobs WHERE id=ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM sessions WHERE client_label=ANY($1::text[])", [labels]);
  await pool.end();
}
