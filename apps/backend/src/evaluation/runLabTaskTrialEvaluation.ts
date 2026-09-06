import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import { ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";

const databaseURL = process.env.LAB_TRIAL_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an explicit disposable loopback database.");
const pool = new Pool({ connectionString: databaseURL, max: 3 });
const calls: Array<{ model: string; prompt: string }> = [];
let invalidOutput = false;
const fetcher = (async (_input: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  calls.push({ model: body.model, prompt: body.messages[0].content });
  return new Response(JSON.stringify({ id: `synthetic-provider-${calls.length}`, model: body.model,
    choices: [{ message: { content: JSON.stringify(invalidOutput ? { outcome: "reply", message: "Invalid synthetic shape" }
      : { outcome: "reply", title: "Synthetic reply", body: "This is a bounded synthetic configuration test." }) } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 } }), { status: 200 });
}) as typeof fetch;
const baseline = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", fetcher });
const candidate = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-4.7", fetcher });
const providers = new Map([[baseline.model, baseline], [candidate.model, candidate]]);
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329,
  allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true,
  internalLabEnabled: true, retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: baseline, labProviders: providers, personResearchProvider: null });
const trialIDs: string[] = [];
const clientLabel = "lab-trial-proof-" + randomUUID();
async function login(account: string, user: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: {
    account_slug: account, user_email: user, client_label: clientLabel,
  } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().access_token;
}
async function request(token: string, method: "GET" | "POST", url: string, payload?: object, expected = 200) {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
  assert.equal(response.statusCode, expected, response.body);
  return response;
}
function observationPlan(duration = 15, stopAfterAdverse = 2) {
  return { question: "Does the concise configuration complete normal product tasks without fallback?",
    success_metric: "product_adoption", guardrail_metric: "fallback_or_product_failure",
    minimum_samples: 3, stop_after_adverse_outcomes: stopAfterAdverse,
    sample_unit: "unique_product_request", assignment_mode: "current_authenticated_session_opt_in",
    rollback: "task_default", window_minutes: duration };
}
function trial(replaces: string | null = null, stopAfterAdverse = 2) {
  const id = randomUUID(); trialIDs.push(id);
  return { id, task: "unscoped_chat", model: candidate.model, prompt_preset: "concise", duration_minutes: 15,
    replaces_trial_id: replaces, observation_plan: observationPlan(15, stopAfterAdverse) };
}
try {
  const a = await login("fixture-alpha", "reviewer@alpha.local");
  const b = await login("fixture-alpha", "reviewer@alpha.local");
  const other = await login("fixture-beta", "recruiter@beta.local");
  const catalog = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  assert.equal(catalog.tasks.find((x: { id: string }) => x.id === "relationship_image").models.length, 0);
  assert.equal(calls.length, 0);
  const first = trial();
  const created = (await request(a, "POST", "/v1/lab/task-trials", first)).json().trial;
  assert.equal(created.session_scope_id, catalog.session_scope_id);
  assert.equal(created.online_assignment, false);
  assert.deepEqual(created.observation_plan, first.observation_plan);
  assert.equal(created.stop_reason, null);
  const mismatched = trial(first.id);
  mismatched.observation_plan.window_minutes = 5;
  await request(a, "POST", "/v1/lab/task-trials", mismatched, 422);
  assert.equal((await request(a, "POST", "/v1/lab/task-trials", { ...first })).json().trial.id, first.id);
  assert.equal(calls.length, 0, "Selecting configuration must not call a model");
  await request(b, "GET", `/v1/lab/task-trials/${first.id}`, undefined, 404);
  await request(other, "GET", `/v1/lab/task-trials/${first.id}`, undefined, 404);
  await request(b, "POST", `/v1/lab/task-trials/${first.id}/stop`, undefined, 404);
  assert.equal((await request(b, "GET", "/v1/lab/task-configuration")).json().trials.length, 0);
  const productTask = { objective: "Hello", idempotency_key: "trial-proof-" + randomUUID() };
  await request(a, "POST", "/v1/chat/unscoped-tasks", productTask, 201);
  assert.equal(calls.at(-1)?.model, candidate.model);
  assert(calls.at(-1)?.prompt.includes("Style experiment: Keep the answer brief"));
  let observed = (await request(a, "GET", "/v1/lab/task-configuration")).json().observations;
  assert.equal(observed[0].measurement.actual_model, candidate.model);
  assert.equal(observed[0].measurement.actual_prompt_revision, created.prompt_revision);
  assert.equal(observed[0].measurement.remote_requests_started, 1);
  assert.equal(observed[0].product_outcome, "accepted");
  assert(!JSON.stringify(observed).includes(productTask.objective));
  let state = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  let summary = state.summaries.find((x: { trial_id: string }) => x.trial_id === first.id);
  assert.equal(summary.samples, 1);
  assert.equal(summary.accepted, 1);
  assert.equal(summary.evidence_state, "collecting");
  assert.equal(summary.causal_claim_allowed, false);
  const callsBeforeSameRequestReplay = calls.length;
  const observationsBeforeSameRequestReplay = observed.filter((x: { trial_id: string }) => x.trial_id === first.id).length;
  const sameRequestReplay = await request(a, "POST", "/v1/chat/unscoped-tasks", productTask, 201);
  assert.equal(sameRequestReplay.headers["idempotent-replayed"], "true");
  assert.equal(calls.length, callsBeforeSameRequestReplay);
  state = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  assert.equal(state.observations.filter((x: { trial_id: string }) => x.trial_id === first.id).length,
    observationsBeforeSameRequestReplay, "A product replay is not another independent sample");
  invalidOutput = true;
  const beforeInvalid = calls.length;
  const invalidReply = await request(a, "POST", "/v1/chat/unscoped-tasks", { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 201);
  invalidOutput = false;
  assert.equal(invalidReply.json().blocks[0].title, "Local reply");
  assert.equal(calls.length, beforeInvalid + 1, "A failed configured Agent cannot silently retry another prompt");
  observed = (await request(a, "GET", "/v1/lab/task-configuration")).json().observations;
  assert.equal(observed[0].product_outcome, "fallback");
  assert.equal(observed[0].measurement.status, "failed");
  state = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  summary = state.summaries.find((x: { trial_id: string }) => x.trial_id === first.id);
  assert.equal(summary.samples, 2);
  assert.equal(summary.fallback, 1);
  assert.equal(state.trials.find((x: { id: string }) => x.id === first.id).status, "active",
    "One adverse outcome remains below this frozen trial's threshold of two");
  await request(b, "POST", "/v1/chat/unscoped-tasks", { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 201);
  assert.equal(calls.at(-1)?.model, baseline.model, "A trial must not affect another sign-in for the same user");
  await request(a, "POST", "/v1/lab/task-trials", trial(), 409);
  const replacement = trial(first.id);
  await request(a, "POST", "/v1/lab/task-trials", replacement);
  const replaced = (await request(a, "POST", "/v1/lab/task-trials", first)).json().trial;
  assert.equal(replaced.status, "stopped");
  assert.equal(replaced.stop_reason, "replaced");
  providers.delete(candidate.model);
  const countBeforeReplay = calls.length;
  const replay = await request(a, "POST", "/v1/chat/unscoped-tasks", productTask, 201);
  assert.equal(replay.headers["idempotent-replayed"], "true");
  assert.equal(calls.length, countBeforeReplay);
  await request(a, "POST", "/v1/chat/unscoped-tasks", { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 409);
  providers.set(candidate.model, candidate);
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  await pool.query(`UPDATE lab_task_trials SET expires_at=$2, record=jsonb_set(record,'{expires_at}',to_jsonb($3::text)) WHERE id=$1`, [replacement.id, expiredAt, expiredAt]);
  await request(a, "POST", "/v1/chat/unscoped-tasks", { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 201);
  assert.equal(calls.at(-1)?.model, baseline.model);
  assert.equal((await request(a, "POST", "/v1/lab/task-trials", replacement)).json().trial.status, "expired");
  const local = trial();
  await request(a, "POST", "/v1/lab/task-trials", local);
  const beforeLocal = calls.length;
  await request(a, "POST", "/v1/chat/unscoped-tasks", { objective: "Leila 有什么变化？", idempotency_key: "trial-proof-" + randomUUID() }, 201);
  assert.equal(calls.length, beforeLocal);
  observed = (await request(a, "GET", "/v1/lab/task-configuration")).json().observations;
  assert.equal(observed[0].measurement.execution, "local_only");
  assert.equal(observed[0].measurement.actual_model, null);
  const manuallyStopped = (await request(a, "POST", `/v1/lab/task-trials/${local.id}/stop`)).json().trial;
  assert.equal(manuallyStopped.status, "stopped");
  assert.equal(manuallyStopped.stop_reason, "manual");
  assert.equal((await request(a, "POST", `/v1/lab/task-trials/${local.id}/stop`)).json().trial.stop_reason, "manual");
  state = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  assert.equal(state.summaries.find((x: { trial_id: string }) => x.trial_id === local.id).evidence_state,
    "ended_below_minimum");
  const guarded = trial(null, 1);
  await request(a, "POST", "/v1/lab/task-trials", guarded);
  invalidOutput = true;
  await request(a, "POST", "/v1/chat/unscoped-tasks",
    { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 201);
  invalidOutput = false;
  state = (await request(a, "GET", "/v1/lab/task-configuration")).json();
  const guardedReceipt = state.trials.find((x: { id: string }) => x.id === guarded.id);
  assert.equal(guardedReceipt.status, "stopped");
  assert.equal(guardedReceipt.stop_reason, "guardrail");
  summary = state.summaries.find((x: { trial_id: string }) => x.trial_id === guarded.id);
  assert.equal(summary.samples, 1);
  assert.equal(summary.fallback, 1);
  assert.equal(summary.evidence_state, "guardrail_stopped");
  const afterGuardrail = calls.length;
  await request(a, "POST", "/v1/chat/unscoped-tasks",
    { ...productTask, idempotency_key: "trial-proof-" + randomUUID() }, 201);
  assert.equal(calls.length, afterGuardrail + 1);
  assert.equal(calls.at(-1)?.model, baseline.model, "The next product request after a guardrail stop must use the default");
  const contenders = [trial(), trial()];
  const competing = await Promise.all(contenders.map((payload) => app.inject({ method: "POST", url: "/v1/lab/task-trials",
    remoteAddress: "127.0.0.2", headers: { authorization: `Bearer ${a}` }, payload })));
  assert.deepEqual(competing.map((response) => response.statusCode).sort(), [200, 409]);
  const winner = competing.find((response) => response.statusCode === 200)!.json().trial;
  await request(a, "POST", `/v1/lab/task-trials/${local.id}/stop`);
  assert.equal((await request(a, "GET", `/v1/lab/task-trials/${winner.id}`)).json().trial.status, "active");
  const disabled = await buildApp({ pool, config: { ...config, internalLabEnabled: false },
    remoteChatProvider: baseline, labProviders: providers, personResearchProvider: null });
  try {
    assert.equal((await disabled.inject({ method: "GET", url: "/v1/lab/task-configuration",
      headers: { authorization: `Bearer ${a}` } })).statusCode, 403);
    const defaultTask = await disabled.inject({ method: "POST", url: "/v1/chat/unscoped-tasks",
      headers: { authorization: `Bearer ${a}` }, payload: { ...productTask, idempotency_key: "trial-proof-" + randomUUID() } });
    assert.equal(defaultTask.statusCode, 201);
    assert.equal(calls.at(-1)?.model, baseline.model, "Disabling Lab must ignore a previously active trial");
  } finally { await disabled.close(); }
  await request(a, "POST", `/v1/lab/task-trials/${winner.id}/stop`);
  console.log(JSON.stringify({ passed: true, provider: "deterministic fetch fixture through real product Agent adapter",
    remote_network_calls: 0, fixture_provider_requests: calls.length,
    checks: ["selection makes no model call", "session isolation", "account isolation", "actual normal product model",
      "actual Agent prompt revision", "metadata-only observation", "frozen observation question and thresholds",
      "observation window must equal trial expiry", "product replay is not another independent sample",
      "descriptive summary forbids causal claims", "compare-and-swap replacement", "replacement reason receipt", "stopped ID replay",
      "product replay before configuration resolution", "removed model blocks new tasks", "expiry restores default",
      "expired ID never reactivates", "local lookup does not claim a model call", "idempotent explicit rollback",
      "manual rollback reason receipt", "ended window reports insufficient sample", "guardrail automatically stops",
      "guardrail restores the default for the next product request",
      "concurrent selections have one winner", "stopping an old trial cannot stop its successor",
      "product adoption is distinct from model execution", "invalid output reports fallback without a second call",
      "disabled capability denies configuration", "disabled capability ignores active trials"] }, null, 2));
} finally {
  await app.close();
  await pool.query("DELETE FROM lab_task_trials WHERE id=ANY($1::uuid[])", [trialIDs]);
  await pool.query("DELETE FROM sessions WHERE client_label=$1", [clientLabel]);
  await pool.end();
}
