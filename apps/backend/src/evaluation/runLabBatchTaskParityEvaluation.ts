import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { digestCanonicalJson, consumeLabRegression } from "@talent-signal/evaluation";
import type { LabJob, LabJobRequest, LabJobTask, LabRegressionExport, LabRegressionRequest } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import type { AuthContext } from "../modules/auth.js";
import { ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";
import { LabExperimentJobService } from "../modules/labExperimentJobs.js";
import { labJobCases } from "../modules/labJobCases.js";
import { LabRegressionService } from "../modules/labRegressions.js";

const databaseURL = process.env.LAB_BATCH_TASK_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an owned disposable loopback database.");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const jobIDs: string[] = [], regressionIDs: string[] = [], labels: string[] = [];
const requests: Array<{ model: string; image: boolean; agent: boolean }> = [];

const provider = new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-text-parity", visionModel: "glm-vision-parity",
  fetcher: (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; tools?: unknown; messages: Array<{ content: unknown }> };
    const image = Array.isArray(body.messages.at(-1)?.content), agent = Array.isArray(body.tools);
    requests.push({ model: body.model, image, agent });
    const output = agent
      ? { outcome: "reply", title: "Bounded workspace", body: "I can explain the workspace and stage reviewable proposals, but I cannot apply an external change." }
      : { kind: "answer", title: "Current schedule", body: "Wednesday at 14:00 is confirmed; Tuesday at 10:00 was cancelled.", citation_ids: ["synthetic-image-1"] };
    return new Response(JSON.stringify({ id: `parity-${requests.length}`, model: body.model,
      choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 20, completion_tokens: 12 } }),
    { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch });
const providers = new Map([[provider.model, provider]]);
const jobs = new LabExperimentJobService(pool, providers, "batch-parity-proof", 120);
const regressions = new LabRegressionService(pool, jobs);
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4332, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const app = await buildApp({ pool, config, remoteChatProvider: provider, labProviders: providers,
  labJobWorkerEnabled: false, personResearchProvider: null });

async function login(): Promise<AuthContext> {
  const label = `batch-parity-${randomUUID()}`; labels.push(label);
  const response = await app.inject({ method: "POST", url: "/v1/auth/simulated-login",
    payload: { account_slug: "fixture-alpha", user_email: "reviewer@alpha.local", client_label: label } });
  assert.equal(response.statusCode, 200, response.body);
  const value = response.json();
  return { accountId: value.account.id, accountSlug: value.account.slug, userId: value.user.id,
    userEmail: value.user.email, userKind: value.user.kind, sessionId: randomUUID() };
}

function request(task: LabJobTask, caseIDs: string[], regressionSource?: { id: string; content_hash: string }): LabJobRequest {
  const id = randomUUID(); jobIDs.push(id);
  const model = task === "relationship_image" ? provider.imageModel! : provider.model;
  return { id, catalog_revision: jobs.catalogRevision, task, case_ids: caseIDs,
    configurations: [{ model, prompt_preset: "baseline" }, { model, prompt_preset: "concise" }],
    repetitions: 1, call_limit: caseIDs.length * 2, ...(regressionSource ? { regression_source: regressionSource } : {}) };
}

function regressionRequest(job: LabJob, caseID: string): LabRegressionRequest {
  const id = randomUUID(); regressionIDs.push(id);
  const attempt = job.attempts.find((value) => value.case_id === caseID)!;
  return { id, source_job_id: job.id, source_attempt_id: attempt.id, source_definition_hash: job.definition_hash,
    failure_categories: ["other"], expected_behavior: job.definition.cases.find((value) => value.id === caseID)!.expected,
    review_note: "Registered synthetic parity proof." };
}

async function run(auth: AuthContext, task: LabJobTask, caseIDs: string[]): Promise<LabJob> {
  const input = request(task, caseIDs);
  await jobs.start(auth, input); await jobs.tick(); await jobs.waitForIdle();
  const result = await jobs.read(auth, input.id);
  assert.equal(result.status, "completed"); assert.equal(result.definition.task, task);
  assert.equal(result.definition.business_write_count, 0);
  assert.deepEqual(result.definition.tool_access, task === "unscoped_chat" ? ["contact_workspace"] : []);
  assert(result.attempts.every((attempt) => attempt.checks.some((check) => check.id === "output_contract" && check.verdict === "pass")));
  return result;
}

async function saveRerunAndConsume(auth: AuthContext, source: LabJob, caseID: string) {
  const saved = await regressions.save(auth, regressionRequest(source, caseID));
  assert.equal(saved.snapshot.task, source.definition.task);
  const rerunRequest = request(source.definition.task, [caseID], { id: saved.id, content_hash: saved.content_hash });
  await jobs.start(auth, rerunRequest); await jobs.tick(); await jobs.waitForIdle();
  const rerun = await jobs.read(auth, rerunRequest.id);
  assert.equal(rerun.status, "completed"); assert.equal(rerun.definition.cases[0]!.input_hash, saved.snapshot.case.input_hash);
  const bundle: LabRegressionExport = { schema_version: "lab-regression-bundle.v1", execution_authority: "none",
    id: saved.id, content_hash: saved.content_hash, snapshot: saved.snapshot, created_at: saved.created_at, expires_at: saved.expires_at };
  const report = consumeLabRegression({ bundle, job: rerun, now: new Date().toISOString(),
    runner: { git_sha: "batch-parity-proof", source_digest: digestCanonicalJson({ revision: "batch-parity-proof" }) },
    transport: "reviewed_local_files" });
  assert.equal(report.new_model_calls, 0); assert.equal(report.release_authority, "none");
  return { saved, rerun, report };
}

try {
  const auth = await login();
  assert.deepEqual(new Set(jobs.models.map((value) => value.task)), new Set(["relationship_text", "relationship_image", "unscoped_chat"]));
  const imageCase = labJobCases("relationship_image")[0]!;
  assert(!imageCase.input_json.includes("base64") && !imageCase.input_json.includes("data:image"));
  const image = await run(auth, "relationship_image", [imageCase.id]);
  assert(image.attempts.every((attempt) => attempt.actual_model === provider.imageModel && attempt.execution === "remote"));
  assert(image.attempts.every((attempt) => attempt.checks.some((check) => check.id === "image_capability" && check.verdict === "pass")));

  const direct = labJobCases("unscoped_chat").find((value) => value.id === "agent-direct-boundary")!;
  const unique = labJobCases("unscoped_chat").find((value) => value.id === "agent-unique-contact")!;
  const agent = await run(auth, "unscoped_chat", [direct.id, unique.id]);
  assert(agent.attempts.filter((attempt) => attempt.case_id === direct.id).every((attempt) => attempt.execution === "remote" && attempt.actual_model === provider.model));
  assert(agent.attempts.filter((attempt) => attempt.case_id === unique.id).every((attempt) => attempt.execution === "local_only"
    && attempt.remote_requests_started === 0 && attempt.actual_model === null));
  assert(agent.attempts.every((attempt) => attempt.checks.some((check) => check.id === "agent_tool_contract" && check.verdict === "pass")));

  const imageRegression = await saveRerunAndConsume(auth, image, imageCase.id);
  const agentRegression = await saveRerunAndConsume(auth, agent, direct.id);
  await assert.rejects(jobs.start(auth, request("relationship_text", [imageCase.id], { id: imageRegression.saved.id,
    content_hash: imageRegression.saved.content_hash })), (error: unknown) => Boolean(error && typeof error === "object" && "statusCode" in error && error.statusCode === 422));

  const proof = { evaluation: "lab_batch_task_parity", catalog_revision: jobs.catalogRevision,
    tasks: { relationship_image: { source_job: image.id, regression: imageRegression.saved.id, rerun: imageRegression.rerun.id },
      workspace_agent: { source_job: agent.id, regression: agentRegression.saved.id, rerun: agentRegression.rerun.id } },
    image_bytes_hash_bound_outside_input_json: true, product_workspace_agent_executor: true,
    agent_remote_and_local_tool_paths_distinguished: true, business_writes: 0,
    regression_and_ci_consumption_for_both_tasks: true, provider_requests: requests.length };
  const output = process.env.LAB_BATCH_TASK_PROOF_OUTPUT_DIR;
  if (output) { await mkdir(output, { recursive: true, mode: 0o700 }); await writeFile(join(output, "proof.json"), JSON.stringify(proof, null, 2), { mode: 0o600 }); }
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await jobs.close(); await app.close();
  if (jobIDs.length) { await pool.query("DELETE FROM lab_experiment_attempts WHERE job_id=ANY($1::uuid[])", [jobIDs]);
    await pool.query("DELETE FROM lab_experiment_jobs WHERE id=ANY($1::uuid[])", [jobIDs]); }
  if (regressionIDs.length) await pool.query("DELETE FROM lab_regressions WHERE id=ANY($1::uuid[])", [regressionIDs]);
  if (labels.length) await pool.query("DELETE FROM sessions WHERE client_label=ANY($1::text[])", [labels]);
  await pool.end();
}
