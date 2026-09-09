import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { bundledPrompt } from "@talent-signal/agent/prompt-registry";
import { CONTRACT_VERSION, type AgentSessionPayload } from "@talent-signal/contracts";
import { buildApp } from "../app.js";
import type { AuthContext } from "../modules/auth.js";
import { configuredChatPrompt, type RemoteChatAnswerProviding, type RemoteChatAnswerRequest } from "../modules/chatAnswerProvider.js";
import { compileRelationshipWiki } from "../modules/wiki.js";
import { feedbackExecution } from "../modules/feedbackExecutions.js";
import { labHash } from "../modules/labJobCases.js";

// Explicit, disposable, loopback-only native proof. No live-provider mode exists.
const databaseURL = process.env.PRODUCT_RUN_UI_DATABASE_URL;
assert(databaseURL, "The explicitly owned disposable database URL is required.");
const parsedDatabase = databaseURL ? new URL(databaseURL) : null;
assert(parsedDatabase && parsedDatabase.protocol === "postgresql:" && !parsedDatabase.search && !parsedDatabase.hash
  && ["localhost", "127.0.0.1"].includes(parsedDatabase.hostname)
  && parsedDatabase.pathname === "/get23_proof" && process.env.PRODUCT_RUN_UI_DISPOSABLE === "true",
"Use the explicitly owned disposable get23_proof database.");
const port = 4343;
process.env.TALENT_SIGNAL_BACKEND_REVISION = "product-run-proof-v1";
process.env.LOG_LEVEL ??= "silent";
delete process.env.TALENT_SIGNAL_OPIK_RUNTIME_POLICY;
const pool = new Pool({ connectionString: databaseURL, max: 6 });
const requests: Array<{ workspace_id: string | null; prompt_preset: string; input_hash: string; image_count: number; input: unknown }> = [];
const provider: RemoteChatAnswerProviding = {
  providerId: "zhipu-chat-completions", model: "glm-5.3", supportsImageInput: false, supportsPromptPresets: true,
  async answer(request: RemoteChatAnswerRequest) {
    const { observation, prompt_snapshot, prompt_preset, images, ...frozenInput } = request;
    // The product host includes images: [] while text-only Lab replay omits
    // that optional empty field. Prove no image content before comparing the
    // complete text input frozen in the execution snapshot.
    assert.equal(images?.length ?? 0, 0, "This proof only accepts the text-only execution path.");
    requests.push({ workspace_id: observation?.workspace_id ?? null, prompt_preset: prompt_preset ?? "baseline",
      input_hash: labHash(frozenInput), image_count: images?.length ?? 0, input: structuredClone(frozenInput) });
    const prompt = prompt_snapshot ?? bundledPrompt("assistant/relationship");
    return { kind: "answer", title: "Wednesday meeting", body: prompt_preset === "concise"
      ? "Wednesday is tentative. Clarify the date before confirming a meeting."
      : "The meeting is confirmed for Wednesday.", citation_ids: request.allowed_citation_ids.slice(0, 1),
      provider_id: "zhipu-chat-completions", model: this.model, provider_request_id: `synthetic-native-${requests.length}`,
      input_tokens: 20, output_tokens: 12, usage_reported: true, prompt_snapshot: prompt,
      prompt_revision: configuredChatPrompt("relationship", prompt_preset ?? "baseline", prompt.text).revision };
  },
};
const app = await buildApp({ pool, config: { databaseUrl: databaseURL, host: "127.0.0.1", port,
  allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false, passwordAuthEnabled: false,
  passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: true,
  retentionSweepIntervalMs: 60_000, sessionTtlSeconds: 3600 }, remoteChatProvider: provider,
  labProviders: new Map([[provider.model, provider]]), personResearchProvider: null, labCIVerifier: null,
  screenshotContact: null, voiceTranscriber: { async transcribe() { throw new Error("Voice is disabled in the native feedback proof."); } } });
const fixtures: Array<Record<string, unknown>> = [];
const httpEvents: Array<{ method: string; path: string; status: number }> = [];
const httpErrors: Array<{ method: string; path: string; message: string }> = [];
app.addHook("onResponse", async (request, reply) => {
  if (request.url.startsWith("/v1/agent-sessions/") || request.url.startsWith("/v1/feedback/")) {
    httpEvents.push({ method: request.method, path: request.url.split("?")[0]!, status: reply.statusCode });
  }
});
app.addHook("onError", async (request, _reply, error) => {
  if (request.url.startsWith("/v1/agent-sessions/")) httpErrors.push({ method: request.method, path: request.url.split("?")[0]!, message: error.message });
  if (request.url === "/proof-prepare") console.error(JSON.stringify({ proof_error: error.name, message: error.message }));
});
app.get("/proof-state", async () => ({ purpose: "owned-product-run-proof", real_provider: false,
  real_requests_started: 0, fixtures, requests, http_events: httpEvents, http_errors: httpErrors }));
app.post("/proof-prepare", async (_request, reply) => {
  const auth: AuthContext = { accountId: randomUUID(), accountSlug: `fixture-feedback-${randomUUID()}`,
    userId: randomUUID(), userEmail: "recruiter@feedback.example.test", userKind: "simulated_human", sessionId: randomUUID() };
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic feedback UI proof')", [auth.accountId, auth.accountSlug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,$3,'Synthetic recruiter','simulated_human')",
    [auth.userId, auth.accountId, auth.userEmail]);
  const person = randomUUID(), context = randomUUID(), capture = randomUUID(), resource = randomUUID(), fragment = randomUUID();
  await pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES($1::uuid,$2,$1::text,'Alex Example')", [person, auth.accountId]);
  await pool.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES($1::uuid,$2,$3,$1::text,'Design role')", [context, auth.accountId, person]);
  await pool.query(`INSERT INTO captures(id,account_id,created_by_user_id,subject_id,assignment_id,source_kind,source_metadata,identity_status,identity_context,purpose)
    VALUES($1,$2,$3,$4,$5,'conversation_transcript','{}','bound','{}','Synthetic native feedback proof')`, [capture, auth.accountId, auth.userId, person, context]);
  await pool.query(`INSERT INTO source_resources(id,account_id,capture_id,created_by_user_id,client_resource_id,resource_kind,input_channel,display_name,media_type,observed_at,retention_scope,processing_state)
    VALUES($1::uuid,$2,$3,$4,$1::text,'conversation_transcript','chat','Synthetic source','text/plain',now(),'reviewed_selected_text','ready')`, [resource, auth.accountId, capture, auth.userId]);
  await pool.query(`INSERT INTO source_retention_receipts(receipt_id,account_id,capture_id,policy_version,requested_mode,effective_mode,source_scope,source_access_state,source_access_reason,created_at,updated_at)
    VALUES($1,$2,$3,'source-retention.v2','ephemeral','ephemeral','reviewed_selected_text','available','awaiting_review_completion',now(),now())`, [randomUUID(), auth.accountId, capture]);
  await pool.query(`INSERT INTO evidence_fragments(id,account_id,capture_id,resource_id,fragment_kind,sequence,text_content,content_hash,locator,attributed_actor,attribution_status,parser_name,parser_version,review_status)
    VALUES($1,$2,$3,$4,'message',0,'Synthetic source: Wednesday is tentative; clarify the exact date.','synthetic','{}','recruiter','confirmed','fixture','1','reviewed')`, [fragment, auth.accountId, capture, resource]);
  await compileRelationshipWiki(pool, auth, person, context, { idempotency_key: randomUUID(), objective: "Compile the synthetic native proof source" });
  const login = await app.inject({ method: "POST", url: "/v1/auth/simulated-login", payload: {
    account_slug: auth.accountSlug, user_email: auth.userEmail, client_label: "native-proof-bootstrap" } });
  assert.equal(login.statusCode, 200, login.body);
  const headers = { "x-talent-signal-platform": "ios", authorization: `Bearer ${login.json().access_token}` };
  // Match JSONEncoder.agentSession's native Date wire precision. The server
  // deliberately rejects changes to an existing turn's original timestamp.
  const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const session: AgentSessionPayload = { id: randomUUID(), scopeKind: "relationship", personID: person, relationshipContextID: context,
    personDisplayLabel: "Alex Example", contextDisplayLabel: "Design role", title: "Wednesday meeting correction", updatedAt: stamp(), isUnread: false, turns: [] };
  const prepared = await app.inject({ method: "PUT", url: `/v1/agent-sessions/${session.id}`, headers,
    payload: { idempotency_key: randomUUID(), expected_revision: 0, payload: session } });
  assert.equal(prepared.statusCode, 200, prepared.body);
  const objective = "What should I clarify before planning the Wednesday meeting?";
  const result = await app.inject({ method: "POST", url: "/v1/chat/tasks", headers, payload: {
    idempotency_key: randomUUID(), session_id: session.id, person_id: person, relationship_context_id: context, objective } });
  assert.equal(result.statusCode, 201, result.body);
  const response = result.json(), turnID = randomUUID();
  session.turns.push({ id: turnID, objective, createdAt: stamp(), response: {
    contractVersion: CONTRACT_VERSION, taskID: response.task_id, contextManifestID: response.context_manifest_id,
    knowledgeSnapshotID: response.knowledge_snapshot_id, disposition: response.disposition, createdAt: response.created_at,
    savedBlocks: response.blocks.map((block: Record<string, unknown>) => ({ id: block.id, kind: block.kind, title: block.title,
      body: block.body, status: block.status, citation_dependency_ids: [], requires_user_decision: false })) } });
  const saved = await app.inject({ method: "PUT", url: `/v1/agent-sessions/${session.id}`, headers,
    payload: { idempotency_key: randomUUID(), expected_revision: prepared.json().session.revision, payload: session } });
  assert.equal(saved.statusCode, 200, saved.body);
  const source = await app.inject({ method: "GET", url: `/v1/agent-sessions/${session.id}/turns/${turnID}/feedback-source`, headers });
  assert.equal(source.statusCode, 200, source.body);
  const original = await feedbackExecution(pool, auth, source.json().source.execution_id);
  assert(original?.snapshot && original.current_state === "available");
  const fixture = { purpose: "owned-product-run-proof", real_provider: false, backend_url: `http://127.0.0.1:${port}`,
    account_slug: auth.accountSlug, account_id: auth.accountId, user_email: auth.userEmail, session_id: session.id, turn_id: turnID,
    original_task_id: response.task_id, original_answer: "The meeting is confirmed for Wednesday.",
    original_source: source.json().source, original_execution: original.snapshot,
    original_input_hash: labHash(original.snapshot.input), session_revision: saved.json().session.revision };
  fixtures.push(fixture);
  return reply.code(201).send(fixture);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  void (async () => { await app.close(); await pool.end(); process.exit(0); })();
});
await app.listen({ host: "127.0.0.1", port });
console.log(JSON.stringify({ purpose: "owned-product-run-proof", listening: port, real_provider: false }));
