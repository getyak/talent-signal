import assert from "node:assert/strict";
import { Pool } from "pg";
import { buildApp } from "../app.js";
import type { BackendConfig } from "../config.js";
import { createEnvironmentChatAnswerProvider, ZhipuChatAnswerProvider } from "../modules/chatAnswerProvider.js";
import { LabCIVerificationError, type LabCIVerifying } from "../modules/labCIVerifier.js";

const databaseURL = process.env.LAB_JOB_EVALUATION_DATABASE_URL;
assert(databaseURL && ["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname), "Use an explicit disposable loopback database.");
const live = process.env.LAB_JOB_REAL_PROVIDER_PROOF === "true";
const ciProof = process.env.LAB_CI_NATIVE_FIXTURE === "true";
assert(!(live && ciProof), "CI protocol fixtures cannot accompany a real-provider proof.");
let requestsStarted = 0, responsesReceived = 0;
let pauseNext = false, release: (() => void) | null = null;
let failNextHardCheck = false;
process.env.TALENT_SIGNAL_BACKEND_REVISION ??= "lab-batch-native-fixture";
const fetcher = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (live && requestsStarted >= 2) throw new Error("Owned batch proof request limit reached");
  requestsStarted += 1;
  if (live) {
    const response = await fetch(url, init); responsesReceived += 1; return response;
  }
  if (pauseNext) {
    pauseNext = false;
    await new Promise<void>((resolve) => { release = resolve; }); release = null;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  const body = JSON.parse(String(init?.body));
  const userContent = body.messages.at(-1)?.content;
  const input = Array.isArray(userContent) ? JSON.parse(userContent.find((part: any) => part.type === "text")?.text ?? "{}")
    : JSON.parse(userContent);
  responsesReceived += 1;
  if (Array.isArray(body.tools)) {
    return new Response(JSON.stringify({ id: "synthetic-agent-" + requestsStarted, model: body.model,
      choices: [{ message: { content: JSON.stringify({ outcome: "reply", title: "Bounded workspace",
        body: "The Workspace Agent can answer and stage reviewable proposals without applying a business change." }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 });
  }
  const citationIds = failNextHardCheck ? ["fixture-unauthorized-citation"] : input.allowed_citation_ids;
  failNextHardCheck = false;
  return new Response(JSON.stringify({ id: "synthetic-batch-" + requestsStarted, model: body.model,
    choices: [{ message: { content: JSON.stringify({ kind: "clarification", title: "Synthetic answer",
      body: "This synthetic answer keeps the evidence open for review.", citation_ids: citationIds }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 });
}) as typeof fetch;
const provider = live ? createEnvironmentChatAnswerProvider(process.env, fetcher)
  : new ZhipuChatAnswerProvider({ apiKey: "fixture-only", model: "glm-5.3", visionModel: "glm-4.6v", fetcher });
assert(provider, "Real mode requires an admitted provider");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const config: BackendConfig = { databaseUrl: databaseURL, host: "127.0.0.1", port: 4329, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
  passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 };
const ciVerifier: LabCIVerifying | null = ciProof ? { repository: "getyak/talent-signal", trustDigest: "sha256:" + "a".repeat(64), async verify(_bundle, _job, runId) {
  if (runId === 124) throw new LabCIVerificationError("LAB_CI_STEP_NOT_EXECUTED");
  return { repository: this.repository, runId, runAttempt: 2, jobId: 456, artifactId: 789, artifactDigest: "sha256:" + "b".repeat(64),
    reportDigest: "sha256:" + "c".repeat(64), sourceRevision: "d".repeat(40), artifactExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    integrity: runId === 125 ? "fail" : "pass", workflowConclusion: runId === 125 ? "failure" : "success", jobConclusion: runId === 125 ? "failure" : "success" };
} } : null;
const app = await buildApp({ pool, config, remoteChatProvider: provider, labProviders: new Map([[provider.model, provider]]), personResearchProvider: null, labCIVerifier: ciVerifier });
app.get("/proof-state", async () => ({ purpose: "owned-native-lab-job-proof", real_provider: live,
  requests_started: requestsStarted, responses_received: responsesReceived, real_request_ceiling: live ? 2 : 0, held_call: release !== null,
  hard_check_failure_armed: failNextHardCheck, ci_verifier: ciProof ? "fixture-only" : "disabled" }));
app.post("/proof/fail-next-hard-check", async (_request, reply) => {
  if (live) return reply.code(403).send({ error: "Fixture-only control" });
  failNextHardCheck = true; return { hard_check_failure_armed: true };
});
app.post("/proof/pause-next", async (_request, reply) => {
  if (live) return reply.code(403).send({ error: "Fixture-only control" });
  pauseNext = true; return { paused_next: true };
});
app.post("/proof/release", async (_request, reply) => {
  if (live) return reply.code(403).send({ error: "Fixture-only control" });
  pauseNext = false;
  release?.(); return { released: true };
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  release?.(); void (async () => { await app.close(); await pool.end(); process.exit(0); })();
});
await app.listen({ host: "127.0.0.1", port: 4329 });
console.log(JSON.stringify({ listening: 4329, real_provider: live, real_request_ceiling: live ? 2 : 0 }));
