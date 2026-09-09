import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { ClaudeChatProvider, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness, claudeHarnessInterruptionCode } from "../../apps/agent/dist/index.js";
import { CONTRACT_VERSION, TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";

const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");
const args = process.argv.slice(2);
assert(args.length === 8 && args[0] === "--endpoint" && args[2] === "--model" && args[4] === "--database" && args[6] === "--output",
  "Usage: evaluate-claude-memory.mjs --endpoint URL --model MODEL --database SYNTHETIC_DATABASE_URL --output PATH");
const database = new URL(args[5]);
assert(database.hostname === "127.0.0.1" && database.pathname === "/get9_eval", "Only the owned loopback synthetic get9_eval database is admitted.");
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
const fixture = { caseID: "E07", dataClass: "synthetic", sourceKind: "conversation_transcript", name: "陈夏", sourceText: "我答应周五给陈夏发原型。",
  objective: "我之前答应陈夏什么来着？", preference: "conclusion_first", conversationHistory: [] };
const report = { evaluation: "get9-memory.v1", createdAt: new Date().toISOString(), configuration: claudeHarnessConfigurationReceipt(configuration),
  fixture, fixtureHash: createHash("sha256").update(JSON.stringify(fixture)).digest("hex"),
  rubric: { version: "get9-quality-v1", scale: [0, 1, 2, 3, 4], minimumEachDimension: 3,
    dimensions: ["task_completion", "grounding", "naturalness", "recovery"],
    caseCriteria: "Retrieve the sourced Friday prototype commitment and saved conclusion-first preference from durable product state in a fresh Session. No old dialogue, invented delivery, or external-write claim. Recovery is not_exercised without a fault." },
  setup: null, trials: [], qualityReview: { status: "pending_independent_review", scores: null }, releaseReady: false };
const pool = new Pool({ connectionString: args[5], max: 4, idleTimeoutMillis: 0 });
let currentTrial, app;
const provider = new ClaudeChatProvider(configuration, async (config, request, signal) => {
  const context = JSON.parse(request.context);
  currentTrial.conversationMessageCount = context.conversation.length;
  currentTrial.effort = request.effort ?? "high"; currentTrial.skillHash = createHash("sha256").update(JSON.stringify(request.skills ?? [])).digest("hex"); currentTrial.effectivePromptHash = createHash("sha256").update(request.systemPrompt).digest("hex");
  currentTrial.budget = request.budget;
  const observed = { ...request, tools: request.tools.map(tool => ({ ...tool, execute: async (...input) => {
    const start = Date.now();
    const result = await tool.execute(...input); currentTrial.tools.push({ name: tool.name, input: input[0], result, durationMs: Date.now() - start }); return result;
  } })) };
  try { currentTrial.receipt = await runClaudeHarness(config, observed, signal, undefined, null); return currentTrial.receipt; }
  catch (error) { currentTrial.sdkFailure = { code: claudeHarnessInterruptionCode(error), receipt: error.receipt }; throw error; }
});
try {
  const account = randomUUID(), user = randomUUID(), slug = `get9-memory-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic GET-9 Memory')", [account, slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'memory@synthetic.local','Synthetic owner','simulated_human')", [user, account]);
  app = await buildApp({ pool, config: { databaseUrl: args[5], host: "127.0.0.1", port: 0,
    allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false, passwordAuthEnabled: false,
    passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: false,
    retentionSweepIntervalMs: 3_600_000, sessionTtlSeconds: 3600,
    chatMediaStorage: { provider: "local", directory: "/tmp/get9-memory-synthetic-media" } },
    remoteChatProvider: provider, personResearchProvider: null, screenshotContact: null, labJobWorkerEnabled: false, labCIVerifier: null });
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = new TalentSignalClient(base);
  await client.login({ account_slug: slug, user_email: "memory@synthetic.local", client_label: "get9-synthetic-memory-evaluation" });
  const preference = await client.saveAgentPreference({ idempotency_key: randomUUID(), expected_revision: 0, response_style: fixture.preference });
  assert.deepEqual(await client.getAgentPreference(), preference);
  const now = new Date().toISOString(), resourceID = randomUUID();
  const capture = await client.createResourceCapture({ contract_version: CONTRACT_VERSION, idempotency_key: randomUUID(), channel: "chat",
    purpose: "Synthetic GET-9 cross-Session Memory evaluation", captured_at: now, source_timezone: "Asia/Shanghai",
    person_scope: { status: "new_person", display_label: fixture.name,
      relationship_context: { status: "proposed", label: "Synthetic prototype follow-up", purpose: "Review a sourced commitment", role: "Contact" },
      binding_basis: "Evaluator-created synthetic person; not a real contact." },
    resource: { client_resource_id: resourceID, kind: fixture.sourceKind, display_name: "Synthetic commitment source", media_type: "text/plain",
      observed_at: now, source_timezone: "Asia/Shanghai", source_locator: `synthetic:get9-memory:${resourceID}`,
      retention: { requested_mode: "ephemeral", source_scope: "reviewed_selected_text" } },
    fragments: [{ client_resource_id: resourceID, kind: "message", sequence: 0, text: fixture.sourceText,
      locator: { kind: "message", source_message_id: resourceID, sequence: 0, speaker_side: "right" },
      attribution: { actor_kind: "recruiter", status: "confirmed" }, review_status: "proposed", parser: { name: "get9-synthetic-fixture", version: "1.0.0" } }] });
  const resource = await client.getRelationshipResource(capture.resource.id), fragment = resource.fragments[0];
  assert(fragment);
  await client.reviewEvidenceFragment(fragment.id, { idempotency_key: randomUUID(), expected_review_status: "proposed", expected_last_review_id: null,
    decision: "reviewed", reason: "The evaluator compared the exact synthetic message before confirmation." });
  const personID = capture.identity.person_id, contextID = capture.identity.relationship_context_id;
  assert(personID && contextID);
  const snapshot = await client.compileKnowledge(personID, contextID, { idempotency_key: randomUUID(), objective: "Preserve this sourced commitment for later retrieval." });
  assert.equal(snapshot.status, "published"); assert.equal(snapshot.quality.verdict, "gold");
  report.setup = { accountID: account, userID: user, personID, contextID, resourceID: resource.id, fragmentID: fragment.id,
    snapshotID: snapshot.id, snapshotStatus: snapshot.status, snapshotQuality: snapshot.quality, preference };
  await writeFile(args[7], JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  for (let trial = 1; trial <= 3; trial++) {
    const started = Date.now(), sessionID = randomUUID(); currentTrial = { trial, sessionID, tools: [] };
    try {
      await client.saveAgentSession(sessionID, { expected_revision: 0, idempotency_key: randomUUID(), payload: { id: sessionID,
        scopeKind: "relationship", personID, relationshipContextID: contextID, personDisplayLabel: fixture.name,
        contextDisplayLabel: "Synthetic prototype follow-up", title: "Fresh Memory evaluation", turns: [], updatedAt: now, isUnread: false } });
      const output = await client.createChatTask({ idempotency_key: randomUUID(), session_id: sessionID, objective: fixture.objective,
        person_id: personID, relationship_context_id: contextID });
      const readback = await client.getChatTaskReadback(output.task_id);
      const persisted = (await pool.query("SELECT committed_turns FROM harness_sessions WHERE account_id=$1 AND product_session_id=$2 AND invalidated_at IS NULL", [account, sessionID])).rows[0];
      const names = currentTrial.tools.map(tool => tool.name);
      const answer = output.blocks.find(block => block.kind === "answer");
      const checks = { freshSessionNoDialogue: currentTrial.conversationMessageCount === 0,
        readMemory: names.includes("read_relationship_memory"), readPreference: names.includes("read_response_preference"),
        citedCommitment: answer?.citation_dependency_ids.includes(fragment.id) === true,
        containsSourcedCommitment: Boolean(answer?.body.includes("周五") && answer.body.includes("原型")),
        committedSDKCheckpoint: persisted?.committed_turns === 1,
        actualModelMatched: currentTrial.receipt?.reportedModels.length === 1 && provider.matchesReportedModel(currentTrial.receipt.reportedModels[0]),
        canonicalReadback: readback.task_id === output.task_id };
      Object.assign(currentTrial, { status: Object.values(checks).every(Boolean) ? "checks_passed" : "checks_failed", checks, output, readback });
    } catch (error) { Object.assign(currentTrial, { status: "failed", errorCode: claudeHarnessInterruptionCode(error) }); }
    currentTrial.durationMs = Date.now() - started; report.trials.push(currentTrial);
    await writeFile(args[7], JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ evaluation: report.evaluation, trial, status: currentTrial.status }));
  }
} finally { await app?.close(); await pool.end(); }
if (report.trials.length !== 3 || report.trials.some(trial => trial.status !== "checks_passed")) process.exitCode = 1;
