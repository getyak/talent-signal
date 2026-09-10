import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { ClaudeChatProvider, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness, claudeHarnessInterruptionCode } from "../../apps/agent/dist/index.js";
import { TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";
const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg"), args = process.argv.slice(2);
assert(args.length === 8 && args[0] === "--endpoint" && args[2] === "--model" && args[4] === "--database" && args[6] === "--output", "Expected endpoint/model/owned database/output arguments.");
const database = new URL(args[5]);
assert(database.hostname === "127.0.0.1" && database.pathname === "/get9_eval", "Only the owned synthetic database is admitted.");
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
const fixture = { caseID: "E10", dataClass: "synthetic", objective: "明天下午三点和陈夏聊半小时，帮我放到日历里。", referenceTime: "2026-09-09T02:00:00.000Z", timeZone: "Asia/Shanghai" };
const report = { evaluation: "get9-calendar.v1", createdAt: new Date().toISOString(), configuration: claudeHarnessConfigurationReceipt(configuration), fixture,
  recoveryPolicy: "At most one explicit simulated-user Retry of the same input/idempotency key after a typed 503; every failed SDK attempt is retained. No automatic server retry.",
  fixtureHash: createHash("sha256").update(JSON.stringify(fixture)).digest("hex"),
  rubric: { version: "get9-quality-v1", scale: [0,1,2,3,4], minimumEachDimension: 3,
    dimensions: ["task_completion", "grounding", "naturalness", "recovery"] },
  trials: [], qualityReview: { status: "pending_independent_review" }, nativeConfirmation: "pending_real_calendar_proof", releaseReady: false };
const pool = new Pool({ connectionString: args[5], max: 4, idleTimeoutMillis: 0, connectionTimeoutMillis: 30000 });
let active, currentAttempt, app;
const provider = new ClaudeChatProvider(configuration, async (config, request, signal) => {
  const target = currentAttempt ?? active;
  target.effort = request.effort ?? "high"; target.skillHash = createHash("sha256").update(JSON.stringify(request.skills ?? [])).digest("hex"); target.effectivePromptHash = createHash("sha256").update(request.systemPrompt).digest("hex"); target.budget = request.budget;
  const observed = { ...request, tools: request.tools.map(tool => ({ ...tool, execute: async (...input) => {
    const started = Date.now(), result = await tool.execute(...input); target.tools.push({ name: tool.name, input: input[0], result, durationMs: Date.now() - started }); return result;
  } })) };
  try { target.receipt = await runClaudeHarness(config, observed, signal, undefined, null); return target.receipt; }
  catch(error) { target.sdkFailure = { code: claudeHarnessInterruptionCode(error), receipt: error.receipt }; throw error; }
});
try {
  const account = randomUUID(), user = randomUUID(), slug = `get9-calendar-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic GET-9 calendar')",[account,slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'calendar@synthetic.local','Synthetic owner','simulated_human')",[user,account]);
  app = await buildApp({ pool, config: { databaseUrl: args[5], host: "127.0.0.1", port: 0, allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false,
    passwordAuthEnabled: false, passwordRegistrationEnabled: false, simulatedAuthEnabled: true, internalLabEnabled: false,
    retentionSweepIntervalMs: 3_600_000, sessionTtlSeconds: 3600, chatMediaStorage: { provider: "local", directory: "/tmp/get9-calendar-synthetic-media" } },
    remoteChatProvider: provider, chatReferenceClock: () => new Date(fixture.referenceTime), personResearchProvider: null,
    screenshotContact: null, labJobWorkerEnabled: false, labCIVerifier: null });
  const base = await app.listen({ host: "127.0.0.1", port: 0 }), client = new TalentSignalClient(base);
  const login = await client.login({ account_slug: slug, user_email: "calendar@synthetic.local", client_label: "get9-synthetic-calendar-evaluation" });
  const request = async body => {
    const response = await fetch(`${base}/v1/chat/unscoped-tasks`, { method: "POST", headers: { authorization: `Bearer ${login.access_token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const result=await response.json();
    if(!response.ok) { const error=new Error(`Calendar HTTP ${response.status}`);error.status=response.status;error.code=result.error?.code;throw error; }
    return result;
  };
  for (let trial = 1; trial <= 3; trial++) {
    active = { trial, tools: [], attempts: [] }; const started = Date.now();
    try {
      const input = { idempotency_key: randomUUID(), objective: fixture.objective, time_zone: fixture.timeZone };
      let output;
      for(let attempt=1;attempt<=2;attempt++){
        currentAttempt={attempt,tools:[]};active.attempts.push(currentAttempt);
        try { output=await request(input);currentAttempt.status="completed";break; }
        catch(error){
          currentAttempt.status="failed";currentAttempt.httpStatus=error.status;currentAttempt.errorCode=error.code??"REQUEST_FAILED";
          if(attempt===2 || error.status!==503 || error.code!=="CLAUDE_CHAT_RETRYABLE_FAILURE")throw error;
          // This test fixture explicitly chooses the client Retry action. The
          // server must not silently rerun or change the original intent key.
          currentAttempt.recoveryDecision="simulated_user_retry_same_intent";
        }
      }
      for(const key of ["tools","receipt","effectivePromptHash","budget","effort","skillHash"]){if(currentAttempt[key]!==undefined)active[key]=currentAttempt[key];}
      const replay=await request(input);
      active.output = output;
      const draft = output.blocks.find(block => block.calendar_draft)?.calendar_draft;
      active.draft = draft;
      active.checks = { hasReviewableDraft: draft?.status === "needs_review", exactStart: draft?.starts_at === "2026-09-10T07:00:00.000Z",
        exactEnd: draft?.ends_at === "2026-09-10T07:30:00.000Z", exactTimeZone: draft?.time_zone === fixture.timeZone,
        frozenReference: draft?.reference_time === fixture.referenceTime,
        literalUserSource: Boolean(draft?.source_excerpt && fixture.objective.includes(draft.source_excerpt)),
        taskProvenance: draft?.source_request_id === output.task_id,
        noExternalEffect: draft?.external_effect === "none" && output.external_effects.length === 0,
        sdkToolReceipt: active.tools.some(tool => tool.name === "stage_calendar_draft" && !tool.result.isError),
        actualModelMatched: active.receipt?.reportedModels.length === 1 && provider.matchesReportedModel(active.receipt.reportedModels[0]),
        canonicalIdempotentReplay: JSON.stringify(replay) === JSON.stringify(output) };
      active.status = Object.values(active.checks).every(Boolean) ? "draft_checks_passed" : "checks_failed";
    } catch(error) { active.status = "failed"; active.errorCode = claudeHarnessInterruptionCode(error); }
    active.durationMs = Date.now() - started; report.trials.push(active);
    await writeFile(args[7], JSON.stringify(report,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({evaluation:report.evaluation,trial,status:active.status}));
  }
} finally { await app?.close(); await pool.end(); }
if(report.trials.some(trial => trial.status !== "draft_checks_passed")) process.exitCode = 1;
