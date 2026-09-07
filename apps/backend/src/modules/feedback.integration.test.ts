import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { bundledPrompt } from "@talent-signal/agent/prompt-registry";
import { CONTRACT_VERSION, type AgentSessionPayload, type FeedbackMutation, type FeedbackSource, type FeedbackObservationRequest } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { AuthContext } from "./auth.js";
import { configuredChatPrompt, type RemoteChatAnswerProviding, type RemoteChatAnswerRequest } from "./chatAnswerProvider.js";
import { compileRelationshipWiki } from "./wiki.js";
import { LabExperimentJobService } from "./labExperimentJobs.js";
import { LabRegressionService } from "./labRegressions.js";
import { FeedbackService, observationAssessment } from "./feedback.js";
import { feedbackExecution } from "./feedbackExecutions.js";

// Explicit opt-in: the suite creates only its own synthetic business fixtures.
const database = process.env.FEEDBACK_TEST_DATABASE_URL;
if (database && !["localhost", "127.0.0.1"].includes(new URL(database).hostname)) throw new Error("Use an owned disposable loopback PostgreSQL database.");
const pool = database ? new Pool({ connectionString: database, max: 6 }) : null;
const auth: AuthContext = { accountId: randomUUID(), accountSlug: `feedback-proof-${randomUUID()}`, userId: randomUUID(),
  userEmail: "feedback-proof@example.test", userKind: "simulated_human", sessionId: randomUUID() };
const requests: RemoteChatAnswerRequest[] = [];
const provider: RemoteChatAnswerProviding = {
  providerId: "zhipu-chat-completions", model: "feedback-proof-model", supportsImageInput: false, supportsPromptPresets: true,
  async answer(input) {
    requests.push(structuredClone(input));
    const prompt = input.prompt_snapshot ?? bundledPrompt("assistant/relationship");
    return { kind: "answer", title: "Evidence-backed next step", body: "Clarify the current date before suggesting a meeting.",
      citation_ids: input.allowed_citation_ids.slice(0, 1), provider_id: "zhipu-chat-completions", model: this.model,
      provider_request_id: `fixture-${requests.length}`, input_tokens: 20, output_tokens: 12, usage_reported: true,
      prompt_snapshot: prompt, prompt_revision: configuredChatPrompt("relationship", input.prompt_preset ?? "baseline", prompt.text).revision };
  },
};
let app: Awaited<ReturnType<typeof buildApp>>, jobs: LabExperimentJobService, regressions: LabRegressionService;
let headers: { authorization: string }, otherHeaders: { authorization: string };
const stamp = () => new Date().toISOString();
beforeAll(async () => {
  if (!pool || !database) return;
  vi.stubEnv("TALENT_SIGNAL_BACKEND_REVISION", "feedback-proof-v1");
  vi.stubEnv("LOG_LEVEL", "silent");
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Feedback proof')", [auth.accountId, auth.accountSlug]);
  for (const id of [auth.userId, randomUUID()]) await pool.query(
    "INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,$3,'Feedback proof','simulated_human')",
    [id, auth.accountId, id === auth.userId ? auth.userEmail : "other@example.test"]);
  const providers = new Map([[provider.model, provider]]);
  jobs = new LabExperimentJobService(pool, providers, "feedback-proof-v1");
  regressions = new LabRegressionService(pool, jobs);
  app = await buildApp({ pool, config: { databaseUrl: database, host: "127.0.0.1", port: 0, allowedOrigins: [], appleSignInAudiences: [],
    appleSignInEnabled: false, passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true,
    internalLabEnabled: true, retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 },
    remoteChatProvider: provider, labProviders: providers, labJobWorkerEnabled: false, personResearchProvider: null });
  for (const email of [auth.userEmail, "other@example.test"]) {
    const login = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: {
      account_slug: auth.accountSlug, user_email: email, client_label: "feedback-isolated-proof" } });
    expect(login.statusCode, login.body).toBe(200);
    const value = { authorization: `Bearer ${login.json().access_token}` };
    if (email === auth.userEmail) headers = value; else otherHeaders = value;
  }
}, 30_000);
afterAll(async () => { await jobs?.close(); await app?.close(); await pool?.end(); vi.unstubAllEnvs(); });

async function fixture() {
  const person = randomUUID(), context = randomUUID(), capture = randomUUID(), resource = randomUUID(), fragment = randomUUID();
  await pool!.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES($1::uuid,$2,$1::text,'Synthetic Person')", [person, auth.accountId]);
  await pool!.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES($1::uuid,$2,$3,$1::text,'Synthetic Context')", [context, auth.accountId, person]);
  await pool!.query(`INSERT INTO captures(id,account_id,created_by_user_id,subject_id,assignment_id,source_kind,source_metadata,identity_status,identity_context,purpose)
    VALUES($1,$2,$3,$4,$5,'conversation_transcript','{}','bound','{}','Synthetic feedback proof')`, [capture, auth.accountId, auth.userId, person, context]);
  await pool!.query(`INSERT INTO source_resources(id,account_id,capture_id,created_by_user_id,client_resource_id,resource_kind,input_channel,display_name,media_type,observed_at,retention_scope,processing_state)
    VALUES($1::uuid,$2,$3,$4,$1::text,'conversation_transcript','chat','Synthetic source','text/plain',now(),'reviewed_selected_text','ready')`, [resource, auth.accountId, capture, auth.userId]);
  await pool!.query(`INSERT INTO source_retention_receipts(receipt_id,account_id,capture_id,policy_version,requested_mode,effective_mode,source_scope,source_access_state,source_access_reason,created_at,updated_at)
    VALUES($1,$2,$3,'source-retention.v2','ephemeral','ephemeral','reviewed_selected_text','available','awaiting_review_completion',now(),now())`, [randomUUID(), auth.accountId, capture]);
  await pool!.query(`INSERT INTO evidence_fragments(id,account_id,capture_id,resource_id,fragment_kind,sequence,text_content,content_hash,locator,attributed_actor,attribution_status,parser_name,parser_version,review_status)
    VALUES($1,$2,$3,$4,'message',0,'Synthetic source: Wednesday is tentative; clarify the exact date.','synthetic','{}','recruiter','confirmed','fixture','1','reviewed')`, [fragment, auth.accountId, capture, resource]);
  await compileRelationshipWiki(pool!, auth, person, context, { idempotency_key: randomUUID(), objective: "Compile the authorized synthetic proof source" });
  const value: AgentSessionPayload = { id: randomUUID(), scopeKind: "relationship", personID: person, relationshipContextID: context,
    personDisplayLabel: "Synthetic Person", contextDisplayLabel: "Synthetic Context", title: "Feedback proof", updatedAt: stamp(), isUnread: false, turns: [] };
  const saved = await app.inject({ method: "PUT", url: `/v1/agent-sessions/${value.id}`, headers,
    payload: { idempotency_key: randomUUID(), expected_revision: 0, payload: value } });
  expect(saved.statusCode, saved.body).toBe(200);
  return { person, context, capture, resource, fragment, value, revision: saved.json().session.revision as number };
}
async function turn(f: Awaited<ReturnType<typeof fixture>>, objective = "What should I clarify before planning a meeting?") {
  const request = { idempotency_key: randomUUID(), session_id: f.value.id, person_id: f.person, relationship_context_id: f.context, objective };
  const answer = await app.inject({ method: "POST", url: "/v1/chat/tasks", headers, payload: request });
  expect(answer.statusCode, answer.body).toBe(201);
  const response = answer.json();
  const id = randomUUID();
  f.value.turns.push({ id, objective, createdAt: stamp(), response: {
    contractVersion: CONTRACT_VERSION, taskID: response.task_id, contextManifestID: response.context_manifest_id,
    knowledgeSnapshotID: response.knowledge_snapshot_id, disposition: response.disposition, createdAt: response.created_at,
    savedBlocks: response.blocks.map((block: Record<string, unknown>) => ({ id: block.id, kind: block.kind, title: block.title,
      body: block.body, status: block.status, citation_dependency_ids: [], requires_user_decision: false })) } });
  const saved = await app.inject({ method: "PUT", url: `/v1/agent-sessions/${f.value.id}`, headers,
    payload: { idempotency_key: randomUUID(), expected_revision: f.revision, payload: f.value } });
  expect(saved.statusCode, saved.body).toBe(200);
  f.revision = saved.json().session.revision;
  f.value = saved.json().session.payload;
  const source = await app.inject({ method: "GET", url: `/v1/agent-sessions/${f.value.id}/turns/${id}/feedback-source`, headers });
  expect(source.statusCode, source.body).toBe(200);
  expect(source.headers["cache-control"]).toBe("no-store");
  expect(source.json().source.source_state).toBe("available");
  return { source: source.json().source as FeedbackSource, request, response, id };
}
function mutation(source: FeedbackSource, expected_revision = 0): FeedbackMutation {
  return { idempotency_key: randomUUID(), expected_revision, session_id: source.session_id, turn_id: source.turn_id,
    expected_session_revision: source.session_revision, execution_id: source.execution_id!, output_hash: source.output_hash!,
    operation: "submit", category: "wrong_time", expected_behavior_proposal: "Retain Wednesday as tentative and clarify its date." };
}
async function put(id: string, body: FeedbackMutation, status = 200) {
  const result = await app.inject({ method: "PUT", url: `/v1/feedback/${id}`, headers, payload: body });
  expect(result.statusCode, result.body).toBe(status);
  return result.json();
}
async function rerun(id: string) {
  const saved = await regressions.read(auth, id), jobID = randomUUID();
  const readback = await app.inject({ method: "GET", url: `/v1/lab/regressions/${id}/export`, headers });
  expect(readback.statusCode, readback.body).toBe(200);
  expect(readback.json().snapshot).toEqual(saved.snapshot);
  const queued = await app.inject({ method: "POST", url: "/v1/lab/experiment-jobs", headers, payload: {
    id: jobID, catalog_revision: jobs.catalogRevision, task: "relationship_text",
    case_ids: [saved.snapshot.case.id], configurations: [{ model: provider.model, prompt_preset: "baseline" }, { model: provider.model, prompt_preset: "concise" }],
    repetitions: 1, call_limit: 2, regression_source: { id, content_hash: saved.content_hash } } });
  expect(queued.statusCode, queued.body).toBe(202);
  await jobs.tick(); await jobs.waitForIdle();
  const job = await jobs.read(auth, jobID);
  const product = await app.inject({ method: "GET", url: `/v1/lab/experiment-jobs/${jobID}`, headers });
  expect(product.statusCode, product.body).toBe(200);
  expect(product.json().job).toEqual(job);
  expect(job.status).toBe("completed");
  expect(job.definition.business_write_count).toBe(0);
  expect(job.definition.cases[0]!.input_hash).toBe(saved.snapshot.case.input_hash);
  expect(job.attempts.every((attempt) => attempt.status === "completed")).toBe(true);
  return { saved, job };
}

function pausedRegressionPool() {
  let reached!: () => void, resume!: () => void;
  const paused = new Promise<void>((resolve) => { reached = resolve; });
  const continuation = new Promise<void>((resolve) => { resume = resolve; });
  const controlled = { query: pool!.query.bind(pool), async connect() {
    const client = await pool!.connect();
    return { release: client.release.bind(client), query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("INSERT INTO lab_regressions")) { reached(); await continuation; }
      return client.query(sql, values);
    } };
  } } as unknown as Pool;
  return { pool: controlled, paused, resume };
}

async function revokeWhilePaused(capture: string, gate: ReturnType<typeof pausedRegressionPool>) {
  const client = await pool!.connect();
  const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const deletion = client.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1", [capture]);
  let waiting = false;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const state = (await pool!.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
      if (state?.wait_event_type === "Lock") { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(waiting, "Source retraction must wait for the frozen execution held by derivation").toBe(true);
  } finally { gate.resume(); await deletion; client.release(); }
}

describe.skipIf(!pool)("Authenticated product feedback learning PostgreSQL loop", () => {
  it("captures the original product request, isolates its owner, handles edit/CAS/idempotency/withdrawal and replays the frozen private input", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID(), body = mutation(original.source);
    const before = await feedbackExecution(pool!, auth, original.source.execution_id!);
    expect(before!.snapshot!.input.objective).toBe(original.request.objective);
    expect(before!.snapshot!.input.reference_time).toBe(before!.snapshot!.reference_time);
    expect(before!.snapshot!.input.context_blocks.length).toBeGreaterThan(0);
    const denied = await app.inject({ method: "GET", url: `/v1/agent-sessions/${f.value.id}/turns/${original.id}/feedback-source`, headers: otherHeaders });
    expect(denied.statusCode).toBe(404);
    const first = (await put(id, body)).feedback;
    expect(first.adjudication).toBe("proposed");
    expect(first.regression_id).toBeTruthy();
    expect((await put(id, body)).feedback.revision).toBe(1);
    await put(id, { ...body, expected_behavior_proposal: "Different intent" }, 409);
    await put(id, { ...body, idempotency_key: randomUUID() }, 409);
    const otherWrite = await app.inject({ method: "PUT", url: `/v1/feedback/${randomUUID()}`, headers: otherHeaders, payload: body });
    expect(otherWrite.statusCode).toBe(404);
    const second = (await put(id, { ...body, idempotency_key: randomUUID(), expected_revision: 1, expected_behavior_proposal: "Clarify the precise date; never confirm a tentative time." })).feedback;
    await expect(regressions.read(auth, first.regression_id)).rejects.toMatchObject({ statusCode: 410 });
    const calls = requests.length, { saved, job } = await rerun(second.regression_id);
    expect(saved.snapshot.data_class).toBe("private_business");
    expect(saved.snapshot.feedback_source!.expectation_authority).toBe("proposal");
    expect(saved.snapshot.case.partition).toBe("development");
    for (const input of requests.slice(calls)) {
      const { prompt_snapshot: _prompt, prompt_preset: _preset, observation: _observation, ...replayed } = input;
      expect(replayed).toEqual(before!.snapshot!.input);
      expect(JSON.stringify(replayed)).not.toContain(second.expected_behavior_proposal);
    }
    await put(id, { ...body, expected_revision: 2, idempotency_key: randomUUID(), operation: "withdraw" });
    await expect(regressions.read(auth, second.regression_id)).rejects.toMatchObject({ statusCode: 410 });
    await expect(jobs.read(auth, job.id)).rejects.toMatchObject({ statusCode: 410 });
    expect((await pool!.query("SELECT count(*)::int AS n FROM lab_experiment_attempts WHERE job_id=$1", [job.id])).rows[0].n).toBe(0);
    expect((await pool!.query("SELECT expected_behavior_proposal FROM product_feedback WHERE id=$1", [id])).rows[0].expected_behavior_proposal).toBeNull();
  }, 30_000);

  it("keeps feedback active after deleting its Lab case, but never returns a dead or mismatched-revision case link", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID(), body = mutation(original.source);
    const feedback = (await put(id, body)).feedback;
    const read = async () => {
      const response = await app.inject({ method: "GET", url: `/v1/feedback/${id}`, headers });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().feedback;
    };
    expect((await read()).regression_id).toBe(feedback.regression_id);
    await pool!.query("UPDATE lab_regressions SET snapshot=jsonb_set(snapshot,'{feedback_source,feedback_revision}','2') WHERE id=$1", [feedback.regression_id]);
    expect((await read()).regression_id).toBeNull();
    await pool!.query("UPDATE lab_regressions SET snapshot=jsonb_set(snapshot,'{feedback_source,feedback_revision}','1') WHERE id=$1", [feedback.regression_id]);
    const deletion = await app.inject({ method: "DELETE", url: `/v1/lab/regressions/${feedback.regression_id}`, headers });
    expect(deletion.statusCode, deletion.body).toBe(200);
    const current = await read();
    expect(current).toMatchObject({ status: "active", revision: 1, source_state: "available", regression_id: null,
      expected_behavior_proposal: body.expected_behavior_proposal });
    expect((await put(id, body)).feedback.regression_id).toBeNull();
    const rows = (await pool!.query("SELECT snapshot,deleted_at FROM lab_regressions WHERE source_feedback_id=$1", [id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ snapshot: null, deleted_at: expect.any(Date) });
  }, 30_000);

  it("records a changed-version later product exposure with bounded observation, then synchronously removes derived replay content on source revocation", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID();
    const feedback = (await put(id, mutation(original.source))).feedback;
    vi.stubEnv("TALENT_SIGNAL_BACKEND_REVISION", "feedback-proof-v2");
    const later = await turn(f, "Has the meeting date been clarified?");
    const laterRow = await feedbackExecution(pool!, auth, later.source.execution_id!);
    const observation: FeedbackObservationRequest = { id: randomUUID(), idempotency_key: randomUUID(), expected_feedback_revision: feedback.revision,
      later_execution_id: later.source.execution_id!, later_output_hash: later.source.output_hash!,
      window_start: laterRow!.created_at.toISOString(), window_end: stamp(), observed_at: stamp(), outcome: "same_issue" };
    observation.observed_at = observation.window_end;
    const post = () => app.inject({ method: "POST", url: `/v1/feedback/${id}/observations`, headers, payload: observation });
    const result = await post();
    expect(result.statusCode, result.body).toBe(200);
    const recorded = result.json().observation;
    expect(recorded.assessment).toBe("issue_observed");
    expect(recorded.causal_claim).toBe("none");
    expect((await post()).json().observation.id).toBe(observation.id);
    const { job } = await rerun(recorded.followup_regression_id);
    const additionalLater = await turn(f), additionalRow = await feedbackExecution(pool!, auth, additionalLater.source.execution_id!);
    const additionalEnd = stamp();
    const extraObservation = await app.inject({ method: "POST", url: `/v1/feedback/${id}/observations`, headers,
      payload: { ...observation, id: randomUUID(), idempotency_key: randomUUID(),
        later_execution_id: additionalLater.source.execution_id!, later_output_hash: additionalLater.source.output_hash!,
        window_start: additionalRow!.created_at.toISOString(), window_end: additionalEnd, observed_at: additionalEnd } });
    expect(extraObservation.statusCode, extraObservation.body).toBe(200);
    const additional = extraObservation.json().observation;
    const caseDeletion = await app.inject({ method: "DELETE", url: `/v1/lab/regressions/${additional.followup_regression_id}`, headers });
    expect(caseDeletion.statusCode, caseDeletion.body).toBe(200);
    const remainingObservation = await app.inject({ method: "GET", url: `/v1/feedback/${id}/observations/${additional.id}`, headers });
    expect(remainingObservation.json().observation).toMatchObject({ assessment: "issue_observed", followup_regression_id: null });
    await pool!.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1", [f.capture]);
    for (const execution of [original.source.execution_id, later.source.execution_id]) {
      const row = await feedbackExecution(pool!, auth, execution!);
      expect(row!.snapshot).toBeNull();
      expect(row!.current_state).not.toBe("available");
    }
    const read = await app.inject({ method: "GET", url: `/v1/feedback/${id}/observations/${observation.id}`, headers });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json().observation.assessment).toBe("unknown");
    expect(read.json().observation.followup_regression_id).toBeNull();
    await expect(jobs.read(auth, job.id)).rejects.toMatchObject({ statusCode: 410 });
    expect((await pool!.query("SELECT snapshot FROM lab_regressions WHERE source_feedback_id=$1", [id])).rows.every((row) => row.snapshot === null)).toBe(true);
  }, 30_000);

  it("denies expired-source readback before maintenance and scrubs it on sweep", async () => {
    const f = await fixture(), source = await turn(f), id = randomUUID();
    const feedback = (await put(id, mutation(source.source))).feedback;
    const { job } = await rerun(feedback.regression_id);
    await pool!.query("UPDATE feedback_execution_snapshots SET expires_at=now()-interval '1 second' WHERE id=$1", [source.source.execution_id]);
    await expect(jobs.read(auth, job.id)).rejects.toMatchObject({ statusCode: 410 });
    await new FeedbackService(pool!).sweep();
    expect((await feedbackExecution(pool!, auth, source.source.execution_id!))!.snapshot).toBeNull();
    expect((await pool!.query("SELECT definition->'cases' AS cases FROM lab_experiment_jobs WHERE id=$1", [job.id])).rows[0].cases).toEqual([]);
  }, 30_000);

  it("fences concurrent feedback writers and removes the original and descendants on Session deletion", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID(), body = mutation(original.source);
    const first = (await put(id, body)).feedback;
    const concurrent = await Promise.all(["Clarify Wednesday.", "Do not confirm Wednesday."].map((proposal) =>
      app.inject({ method: "PUT", url: `/v1/feedback/${id}`, headers, payload: {
        ...body, expected_revision: 1, idempotency_key: randomUUID(), expected_behavior_proposal: proposal } })));
    expect(concurrent.map((value) => value.statusCode).sort()).toEqual([200, 409]);
    const current = concurrent.find((value) => value.statusCode === 200)!.json().feedback;
    const { job } = await rerun(current.regression_id);
    const child = await regressions.save(auth, { id: randomUUID(), source_job_id: job.id, source_attempt_id: job.attempts[0]!.id,
      source_definition_hash: job.definition_hash, failure_categories: ["stale_evidence"], expected_behavior: "Retain uncertainty.", review_note: "Human review proposal" });
    expect(child.snapshot.data_class).toBe("private_business");
    const deletion = await app.inject({ method: "DELETE", url: `/v1/agent-sessions/${f.value.id}`, headers,
      payload: { expected_revision: f.revision, idempotency_key: randomUUID() } });
    expect(deletion.statusCode, deletion.body).toBe(200);
    expect((await feedbackExecution(pool!, auth, original.source.execution_id!))!.snapshot).toBeNull();
    for (const regression of [first.regression_id, current.regression_id, child.id])
      await expect(regressions.read(auth, regression)).rejects.toMatchObject({ statusCode: 410 });
    const withdrawn = (await put(id, { ...body, expected_revision: 2, idempotency_key: randomUUID(), operation: "withdraw" })).feedback;
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.source_state).toBe("source_deleted");
  }, 30_000);

  it("invalidates corrected message evidence without allowing a later restore to resurrect the original learning record", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID();
    const feedback = (await put(id, mutation(original.source))).feedback;
    await pool!.query("UPDATE evidence_fragments SET text_content='Corrected synthetic message: no meeting is planned.' WHERE id=$1", [f.fragment]);
    expect((await feedbackExecution(pool!, auth, original.source.execution_id!))!.snapshot).toBeNull();
    await pool!.query("UPDATE evidence_fragments SET text_content='Synthetic source: Wednesday is tentative; clarify the exact date.' WHERE id=$1", [f.fragment]);
    const record = await new FeedbackService(pool!).read(auth, id);
    expect(record.source_state).not.toBe("available");
    expect(record.expected_behavior_proposal).toBeNull();
    await expect(regressions.read(auth, feedback.regression_id)).rejects.toMatchObject({ statusCode: 410 });
  }, 30_000);

  it("fences source revocation while an observation is paused before its derived regression INSERT", async () => {
    vi.stubEnv("TALENT_SIGNAL_BACKEND_REVISION", "race-before");
    const f = await fixture(), original = await turn(f), id = randomUUID();
    const feedback = (await put(id, mutation(original.source))).feedback;
    vi.stubEnv("TALENT_SIGNAL_BACKEND_REVISION", "race-after");
    const later = await turn(f), laterRow = await feedbackExecution(pool!, auth, later.source.execution_id!);
    const end = stamp(), observationID = randomUUID(), gate = pausedRegressionPool();
    const pending = new FeedbackService(gate.pool).observe(auth, id, { id: observationID, idempotency_key: randomUUID(),
      expected_feedback_revision: feedback.revision, later_execution_id: later.source.execution_id!, later_output_hash: later.source.output_hash!,
      window_start: laterRow!.created_at.toISOString(), window_end: end, observed_at: end, outcome: "same_issue" });
    await gate.paused;
    await revokeWhilePaused(f.capture, gate);
    await pending;
    const rows = (await pool!.query("SELECT snapshot FROM lab_regressions WHERE source_feedback_id=$1", [id])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.snapshot === null)).toBe(true);
    expect((await new FeedbackService(pool!).readObservation(auth, id, observationID)).assessment).toBe("unknown");
  }, 30_000);

  it("fences source revocation while saving a child of a private Lab regression", async () => {
    const f = await fixture(), original = await turn(f), id = randomUUID();
    const feedback = (await put(id, mutation(original.source))).feedback;
    const { job } = await rerun(feedback.regression_id), childID = randomUUID(), gate = pausedRegressionPool();
    const pending = new LabRegressionService(gate.pool, jobs).save(auth, { id: childID, source_job_id: job.id,
      source_attempt_id: job.attempts[0]!.id, source_definition_hash: job.definition_hash,
      failure_categories: ["stale_evidence"], expected_behavior: "Clarify the current date.", review_note: "Concurrent source revocation proof" });
    // Post-commit readback may already observe the concurrent deletion, which is the correct 410 outcome.
    const outcome = pending.catch((error: unknown) => { expect(error).toMatchObject({ statusCode: 410 }); });
    await gate.paused;
    await revokeWhilePaused(f.capture, gate);
    await outcome;
    expect((await pool!.query("SELECT snapshot,deleted_at FROM lab_regressions WHERE id=$1", [childID])).rows[0]).toMatchObject({ snapshot: null, deleted_at: expect.any(Date) });
  }, 30_000);

  it.each([true, false])("does not retain a late model result after source revocation (persisted Session: %s)", async (withSession) => {
    const f = await fixture();
    let reached!: () => void, resume!: () => void;
    const paused = new Promise<void>((resolve) => { reached = resolve; });
    const continuation = new Promise<void>((resolve) => { resume = resolve; });
    const originalAnswer = provider.answer.bind(provider);
    const intercepted = vi.spyOn(provider, "answer").mockImplementation(async (input) => {
      reached(); await continuation; return originalAnswer(input);
    });
    try {
      const key = randomUUID();
      const pending = app.inject({ method: "POST", url: "/v1/chat/tasks", headers, payload: {
        idempotency_key: key, ...(withSession ? { session_id: f.value.id } : {}), person_id: f.person, relationship_context_id: f.context,
        objective: "Clarify the date from the original source." } });
      await paused;
      await pool!.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1", [f.capture]);
      resume();
      const response = await pending;
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().error.code).toBe("CHAT_COMPLETION_SOURCE_CHANGED");
      expect((await pool!.query("SELECT snapshot FROM feedback_execution_snapshots WHERE session_id=$1", [f.value.id])).rows).toEqual([]);
      expect((await pool!.query("SELECT response_body FROM idempotency_records WHERE account_id=$1 AND idempotency_key=$2", [auth.accountId, key])).rows).toEqual([]);
    } finally { resume(); intercepted.mockRestore(); }
  }, 30_000);
});

describe("Feedback observation uncertainty", () => {
  const window = { window_start: "2026-09-01T00:00:00Z", window_end: "2026-09-02T00:00:00Z", observed_at: "2026-09-01T12:00:00Z", outcome: "no_issue_observed" as const };
  it("claims only an observed window, with missing, late, censored, immature and unavailable outcomes unknown", () => {
    expect(observationAssessment(window, "2026-09-03T00:00:00Z", true)).toBe("no_issue_observed_in_window");
    for (const outcome of ["missing", "late", "censored"] as const) expect(observationAssessment({ ...window, outcome }, "2026-09-03T00:00:00Z", true)).toBe("unknown");
    expect(observationAssessment(window, "2026-09-01T18:00:00Z", true)).toBe("unknown");
    expect(observationAssessment(window, "2026-09-03T00:00:00Z", false)).toBe("unknown");
    expect(observationAssessment({ ...window, observed_at: null }, "2026-09-03T00:00:00Z", true)).toBe("unknown");
  });
});
