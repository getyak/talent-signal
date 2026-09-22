#!/usr/bin/env node
/**
 * GET-40 bounded actual-model evaluator (parent-run).
 *
 * Runs the 20 frozen synthetic cases through the real production host with the
 * admitted Claude provider, using real conversation-queue admission so the
 * completed Session turn (and its Memory reference) is actually persisted and
 * reviewable. It is intentionally separate from the deterministic scripted
 * fixtures: these numbers are model behavior, not product acceptance.
 *
 * Usage:
 *   node scripts/evals/get40/evaluate-model.mjs \
 *     --endpoint https://api.hao.ai/anthropic \
 *     --model anthropic/claude-sonnet-5 \
 *     --database postgres://get40_test@127.0.0.1:55440/get40_test \
 *     --cases /Users/cubxxw/.local/state/talent-signal-get40/frozen-cases.json \
 *     --output /private/tmp/ai-test-get-40.G6UF0E/get40/model-evaluation.json \
 *     --max-estimated-usd 1.00 --max-cases 20
 *
 * No credential values are accepted on the command line or written to reports.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  ClaudeChatProvider,
  claudeHarnessConfiguration,
  claudeHarnessConfigurationReceipt,
  runClaudeHarness,
  ClaudeHarnessFailure,
} from "../../../apps/agent/dist/index.js";
import { TalentSignalClient } from "../../../packages/contracts/dist/index.js";
import { buildApp } from "../../../apps/backend/dist/app.js";

const require = createRequire(new URL("../../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const OFFICIAL_ENDPOINT = "https://api.hao.ai/anthropic";
const DEFAULT_RESERVATION_USD = 0.03;
const INPUT_ROOT = fileURLToPath(new URL("./inputs/", import.meta.url));

function parseArgs(argv) {
  const options = {
    endpoint: null,
    model: null,
    database: null,
    cases: `${INPUT_ROOT}/frozen-cases.json`,
    output: null,
    offline: false,
    offlineScenario: "normal",
    maxEstimatedUsd: 1.0,
    maxCases: 20,
    queueTimeoutMs: 120_000,
    pollMs: 200,
    reservationUsd: DEFAULT_RESERVATION_USD,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--offline-scenario") options.offlineScenario = value;
    else if (flag === "--offline") options.offline = value === "true";
    else if (flag === "--endpoint") options.endpoint = value;
    else if (flag === "--model") options.model = value;
    else if (flag === "--database") options.database = value;
    else if (flag === "--cases") options.cases = value;
    else if (flag === "--output") options.output = value;
    else if (flag === "--max-estimated-usd") options.maxEstimatedUsd = Number(value);
    else if (flag === "--max-cases") options.maxCases = Number(value);
    else if (flag === "--queue-timeout-ms") options.queueTimeoutMs = Number(value);
    else if (flag === "--reservation-usd") options.reservationUsd = Number(value);
    else throw new Error(`Unknown argument ${flag}`);
  }
  assert(options.output, "--output is required");
  assert(options.endpoint, "--endpoint is required");
  assert(options.model, "--model is required");
  assert(options.database, "--database is required");
  assert(Number.isFinite(options.maxEstimatedUsd) && options.maxEstimatedUsd > 0, "--max-estimated-usd must be > 0");
  assert(Number.isInteger(options.maxCases) && options.maxCases >= 0 && options.maxCases <= 20, "--max-cases must be 0..20");
  assert(Number.isFinite(options.reservationUsd) && options.reservationUsd >= 0, "--reservation-usd must be >= 0");
  return options;
}

function assertOwnedSyntheticDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  assert(LOOPBACK.has(parsed.hostname), "Only a loopback synthetic database is admitted.");
  assert(
    /(?:^|\/)(get40_test|get40_eval|talent_signal_get40_test)$/.test(parsed.pathname),
    "The database name must be an owned synthetic get40 database.",
  );
  assert(!/(production|prod|live)/i.test(parsed.pathname), "Refusing a production-looking database name.");
}

function caseInputHash(entry) {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function makeAccount(pool, caseId) {
  const accountId = randomUUID();
  const userId = randomUUID();
  const slug = `get40-eval-${caseId.replace(/[^a-z0-9-]/gi, "-")}-${accountId.slice(0, 8)}`;
  const email = `${slug}@synthetic.local`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,$3)", [accountId, slug, `GET-40 synthetic ${caseId}`]);
  await pool.query(
    "INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,$3,$4,'simulated_human')",
    [userId, accountId, email, "Synthetic owner"],
  );
  return {
    accountId,
    userId,
    email,
    auth: {
      accountId,
      accountSlug: slug,
      userId,
      userEmail: email,
      userKind: "simulated_human",
      sessionId: randomUUID(),
    },
  };
}

async function seedContact(pool, auth, label, handle) {
  const personId = randomUUID();
  const contextId = randomUUID();
  await pool.query(
    "INSERT INTO subjects(id,account_id,external_ref,display_label,status) VALUES($1,$2,$3,$4,'active')",
    [personId, auth.accountId, `get40-eval-person:${personId}`, label],
  );
  await pool.query(
    "INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label,status) VALUES($1,$2,$3,$4,$5,'active')",
    [contextId, auth.accountId, personId, `get40-eval-context:${contextId}`, `${label} relationship`],
  );
  if (handle) {
    await pool.query(
      `INSERT INTO identity_handles(id,account_id,subject_id,handle_type,normalized_value_hash,display_hint,status,confirmed_by_user_id,freshness_policy_version,validity_basis,valid_until)
       VALUES($1,$2,$3,$4,$5,$6,'confirmed',$7,'identity-freshness-2026-08-07.v1','policy_default',now()+interval '180 days')`,
      [randomUUID(), auth.accountId, personId, handle.type, sha256(handle.value), handle.hint ?? handle.value, auth.userId],
    );
  }
  return { personId, contextId };
}

function acceptedCandidate(text, contact, contextId, caseId) {
  const scope = caseId === "20-image-injection" ? "self" : "person";
  return {
    scope, operation: "add", statement_kind: scope === "self" ? "user_opinion" : "source_statement",
    display_text: text, subject_id: scope === "self" ? null : contact, relationship_context_id: null,
    speaker: scope === "self" ? "我" : "陈宇", reporter: null, valid_time: null, observed_time: null,
    time_status: ["11-supported-update","12-true-conflict","14-revoked-memory"].includes(caseId) ? "future" : "known",
    sensitivity: "normal", source_excerpt: text, source_locator: { kind: "message", session_id: null, message_id: null },
    previous_memory_item_id: null, previous_text: null, previous_revision: null,
    reason: "Frozen synthetic accepted state.",
  };
}

async function insertAcceptedSession(pool, auth, texts) {
  const sessionId = randomUUID();
  const messageId = randomUUID();
  const objective = texts.join("\n");
  const iso = new Date().toISOString();
  await pool.query(
    `INSERT INTO agent_sessions(account_id,id,created_by_user_id,revision,payload,created_at,expires_at)
     VALUES($1,$2,$3,1,$4::jsonb,now(),now() + interval '30 days')`,
    [auth.accountId, sessionId, auth.userId, JSON.stringify({
      id: sessionId,
      scopeKind: "unresolved_intent",
      personDisplayLabel: "",
      contextDisplayLabel: "",
      title: "GET-40 evaluator accepted setup",
      updatedAt: iso,
      isUnread: false,
      turns: [{
        id: messageId,
        objective,
        createdAt: iso,
        response: {
          contractVersion: "2026-08-24.10",
          taskID: randomUUID(),
          contextManifestID: randomUUID(),
          knowledgeSnapshotID: randomUUID(),
          disposition: "answer",
          createdAt: iso,
        },
      }],
    })],
  );
  return { sessionId, messageId };
}

/**
 * Real accepted state per frozen case, created through the production staging
 * and commit domain on a bound authenticated contact/context. Cases without a
 * declared prerequisite are recorded as such instead of fabricating state.
 */
async function seedCaseSetup(pool, client, account, entry) {
  const { stageMemoryProposal, commitMemoryReview, openMemoryReview, resolveSessionSourceAuthority, recallMemories } =
    await import("../../../apps/backend/dist/modules/memoryReview.js");
  const caseId = entry.id;
  const bound = ["04-future-not-current", "11-supported-update", "12-true-conflict", "14-revoked-memory"].includes(caseId);
  const known = bound || ["10-stable-handle", "15-duplicate", "16-paraphrase"].includes(caseId);
  const contact = known ? await seedContact(pool, account.auth, "陈宇", { type:"source_native_id",value:"chenyu_demo" }) : null;
  const contacts = contact ? [contact] : [];
  if (caseId === "09-same-name") {
    for(const value of ["chenyu_design","chenyu_growth"]) contacts.push(await seedContact(pool,account.auth,"陈宇",{type:"source_native_id",value}));
  }
  const texts = ["09-same-name","10-stable-handle"].includes(caseId) ? [] : entry.accepted.map(text=>text.replace(/^revoked: /u,""));
  let source = null;
  if (texts.length) {
    source = await insertAcceptedSession(pool,account.auth,texts);
    const authority=await resolveSessionSourceAuthority(pool,account.auth,source.sessionId,source.messageId);
    const staged=await stageMemoryProposal(pool,account.auth,{
      idempotency_key:randomUUID(),surface:"chat",session_id:source.sessionId,source_message_id:source.messageId,
      person_id:contact?.personId??null,relationship_context_id:contact?.contextId??null,
      contact_decision:contact?"existing":"none",identity_authority:contact?"human_selection":"tentative",
      proposer:{kind:"human",name:"get40-frozen-setup",version:"2"},
      items:texts.map(text=>acceptedCandidate(text,contact?.personId??null,contact?.contextId??null,caseId)),
    },authority);
    assert(staged,"Accepted setup did not stage");
    const opened=await openMemoryReview(pool,account.auth,staged.proposal.proposal_id,{purpose:"chat"});
    await commitMemoryReview(pool,account.auth,opened.review.review_scope_id,opened.review_credential,{
      idempotency_key:randomUUID(),expected_proposal_revision:opened.review.proposal_revision,
      contact_decision:contact?"existing":"none",identity_authority:contact?"human_selection":"tentative",
      selected_item_ids:opened.review.items.map(item=>item.id),edited_text:{},item_decisions:{},expected_item_versions:{},reason:"Frozen synthetic prerequisite",
    });
    if(caseId==="14-revoked-memory") {
      const current=await client.getAgentSession(source.sessionId);
      await client.deleteAgentSession(source.sessionId,{expected_revision:current.session.revision,idempotency_key:randomUUID()});
    }
  }
  const people=(await pool.query("SELECT id FROM subjects WHERE account_id=$1 AND status='active' AND external_ref NOT LIKE 'workspace-owner:%'",[account.accountId])).rows;
  assert.equal(people.length,caseId==="09-same-name"?2:known?1:0);
  const handles=(await pool.query("SELECT handle_type,display_hint,status FROM identity_handles WHERE account_id=$1 ORDER BY display_hint",[account.accountId])).rows;
  assert.deepEqual(handles.map(row=>[row.handle_type,row.display_hint,row.status]),
    (caseId==="09-same-name"?["chenyu_design","chenyu_growth"]:known?["chenyu_demo"]:[]).map(value=>["source_native_id",value,"confirmed"]));
  const memories=(await pool.query("SELECT scope,display_text,time_status,status FROM memory_items WHERE account_id=$1 ORDER BY created_at,id",[account.accountId])).rows;
  assert.deepEqual(memories.map(row=>row.display_text),texts.map(text=>text.normalize("NFKC")));
  assert(memories.every(row=>row.scope===(caseId==="20-image-injection"?"self":"person")));
  assert(memories.every(row=>row.time_status===(["11-supported-update","12-true-conflict","14-revoked-memory"].includes(caseId)?"future":"known")));
  const recall=await recallMemories(pool,account.auth,{surface:"chat",person_id:contact?.personId??null,relationship_context_id:contact?.contextId??null});
  assert.equal(recall.items.length,caseId==="14-revoked-memory"?0:texts.length);
  if(bound) await client.compileKnowledge(contact.personId,contact.contextId,{idempotency_key:randomUUID(),objective:"Prepare this explicitly selected synthetic relationship"});
  return {setup:{contactCount:people.length,handles,memories,source,readbackVerified:true,revoked:caseId==="14-revoked-memory"},contact,bound};
}

/** Decode the MCP-shaped tool result the harness adapter returns. */
function decodeToolResult(result) {
  let payload = null;
  const text = result?.content?.find?.((entry) => entry?.type === "text")?.text;
  if (typeof text === "string") {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }
  return {
    ok: result?.isError !== true && !(payload && payload.ok === false),
    isError: result?.isError === true || Boolean(payload && payload.ok === false),
    operation: payload?.data?.operation ?? payload?.operation ?? null,
    proposalId: payload?.data?.proposal_id ?? payload?.proposal_id ?? null,
    recalledCount: Array.isArray(payload?.data?.items) ? payload.data.items.length : null,
    error: payload?.error?.code ?? payload?.error ?? null,
    payload,
  };
}

function recordUsage(record,result) {
  if(!result){record.usageComplete=false;return;}
  for(const [source,target] of [["inputTokens","inputTokens"],["outputTokens","outputTokens"],["estimatedUsd","sdkEstimatedUsd"]]) {
    if(Number.isFinite(result[source]))record[target]=(record[target]??0)+result[source];
    else record.usageComplete=false;
  }
  if(result.usageComplete===false)record.usageComplete=false;
  record.permissionDenials = [...new Set([...(record.permissionDenials ?? []),
    ...(result.permissionDenials ?? []).map(code => typeof code === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(code) ? code : "PERMISSION_DENIED")])];
  record.terminalReason = typeof result.terminalReason === "string" && /^[A-Za-z][A-Za-z0-9_]{1,100}$/.test(result.terminalReason) ? result.terminalReason : "unavailable";
  record.turns+=result.turns??0;record.reportedModels=[...new Set([...(record.reportedModels??[]),...(result.reportedModels??[])])];
}
async function offlineHarness(request,signal,record,mode) {
  const receipt={sessionID:randomUUID(),inputTokens:1,outputTokens:1,estimatedUsd:0,turns:1,toolCalls:0,terminalReason:"failed",permissionDenials:[],reportedModels:["offline-injected-harness"]};
  if(mode==="failure")throw new ClaudeHarnessFailure(receipt,"SYNTHETIC_PROVIDER_FAILURE");
  if(mode==="timeout")await new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener("abort",()=>reject(signal.reason),{once:true});});
  assert(request.budget.maxEstimatedUsd<=0.15);assert(request.budget.maxTurns<=6);assert(request.budget.maxTaskTokens<=24000);
  signal.throwIfAborted();
  if(record.id==="01-self-style") {
    const tool=request.tools.find(tool=>tool.name==="memory_review");assert(tool,"Real host Memory tool missing");
    const result=await tool.execute({operation:"propose",contact_decision:"none",items:[{scope:"self",operation:"add",statement_kind:"user_opinion",dependence_kind:"independent_self",display_text:"用户明确要求回复先给结论，再解释理由。",source_excerpt:record.input,source_locator:{kind:"message"},speaker:"我",time_status:"known",sensitivity:"normal",reason:"之后组织回复时使用。"}]},signal);
    assert(!result.isError,JSON.stringify(result));
  }
  return {text:"离线合成链路验证：此回复不代表模型质量。",structuredOutput:null,sessionID:randomUUID(),inputTokens:1,outputTokens:1,estimatedUsd:mode==="unknown"?undefined:0,turns:1,toolCalls:0,terminalReason:"completed",permissionDenials:[],reportedModels:["offline-injected-harness"]};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertOwnedSyntheticDatabase(options.database);
  const endpoint = new URL(options.endpoint);
  assert(
    endpoint.protocol === "https:" && endpoint.origin + endpoint.pathname.replace(/\/$/, "") === OFFICIAL_ENDPOINT,
    `Only the admitted model endpoint ${OFFICIAL_ENDPOINT} is allowed.`,
  );
  const frozen = JSON.parse(await readFile(resolve(options.cases), "utf8"));
  assert(Array.isArray(frozen.cases) && frozen.cases.length === 20, "frozen-cases.json must contain 20 cases");

  const configuration = claudeHarnessConfiguration({
    ...process.env,
    ...(options.offline ? { HAO_ANTHROPIC_API_KEY: "offline-never-transmitted" } : {}),
    TALENT_SIGNAL_CLAUDE_TASK_BUDGET_ENABLED: "false",
    ANTHROPIC_BASE_URL: options.endpoint,
    TALENT_SIGNAL_AGENT_MODEL: options.model,
  });
  const report = {
    evaluation: "get40-model.v2",
    mode: options.offline ? "offline-production-path-preflight" : "actual-model",
    frozenHash: sha256(await readFile(resolve(options.cases))),
    gitHead: execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
    dirtyDiffHash: sha256(execFileSync("git",["diff","HEAD"])),
    sourceTreeHash: sha256(await Promise.all(execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"})
      .split("\0").filter(Boolean).sort().map(async path=>`${path}\0${await readFile(path).then(bytes=>sha256(bytes),()=>"deleted")}\n`)).then(rows=>rows.join(""))),
    createdAt: new Date().toISOString(),
    dataClass: "synthetic",
    modelQualityNotProductAcceptance: true,
    configuration: claudeHarnessConfigurationReceipt(configuration),
    boundary: {
      database: `${endpointName(options.database)} (loopback synthetic, name only)`,
      maxEstimatedUsd: options.maxEstimatedUsd,
      reservationUsd: options.reservationUsd,
      maxCases: options.maxCases,
      externalWrites: 0,
      browserTools: 0,
      publicResearchTools: 0,
      admission: "conversation_queue",
    },
    cases: [],
    totals: { casesRun: 0, inputTokens: 0, outputTokens: 0, sdkEstimatedUsd: 0, billedUsd: null, usageUnknownCases: 0, stopped: null },
    incomplete: [],
  };

  if (options.maxCases === 0) {
    await writeReport(options.output, report);
    process.stdout.write(`No cases run (--max-cases 0). Report: ${options.output}\n`);
    return;
  }

  const pool = new Pool({ connectionString: options.database, max: 4, idleTimeoutMillis: 0 });
  let app = null;
  let spentUsd = 0;
  let currentCase = null;
  try {
    const provider = new ClaudeChatProvider(configuration, async (config, request, signal) => {
      const record = currentCase;
      assert(record, "Provider invoked outside a bounded case");
      record.harnessStarted = true;
      const remaining = options.maxEstimatedUsd - spentUsd - (record.sdkEstimatedUsd ?? 0);
      assert(remaining >= options.reservationUsd, "Remaining case budget exhausted");
      const budget = { ...request.budget, maxEstimatedUsd: Math.min(0.15,remaining), maxTurns:Math.min(6,request.budget.maxTurns),
        maxToolCalls:Math.min(12,request.budget.maxToolCalls),maxTaskTokens:Math.min(24000,request.budget.maxTaskTokens),
        maxDurationMs:Math.min(options.queueTimeoutMs,request.budget.maxDurationMs) };
      const caseSignal = AbortSignal.any([signal,record.abort.signal,AbortSignal.timeout(budget.maxDurationMs)]);
      record.promptHashes.push(sha256(JSON.stringify({system:request.systemPrompt,context:request.context,objective:request.objective})));
      const observed = {
        ...request,
        budget,
        onProtocolMetadata:event=>record.protocol.push(event),
        tools: request.tools.map((tool) => ({
          ...tool,
          execute: async (...toolInput) => {
            const attempt={name:tool.name,input:toolInput[0]??null,state:"attempted"};
            record.tools.push(attempt);
            try {
              const result = await tool.execute(...toolInput);
              Object.assign(attempt,decodeToolResult(result),{state:result.isError?"rejected":"completed"});
              return result;
            } catch(error) {attempt.state="failed";throw error;}
          },
        })),
      };
      try {
        const result = options.offline ? await offlineHarness(observed,caseSignal,record,options.offlineScenario) : await runClaudeHarness(config, observed, caseSignal, undefined, null);
        recordUsage(record,result);return result;
      } catch(error) {recordUsage(record,error.receipt);record.providerFailure=error.message;throw error;}
      finally {record.harnessSettled=true;}

    });
    app = await buildApp({
      pool,
      config: {
        databaseUrl: options.database,
        host: "127.0.0.1",
        port: 0,
        allowedOrigins: [],
        appleSignInAudiences: [],
        appleSignInEnabled: false,
        passwordAuthEnabled: false,
        passwordRegistrationEnabled: false,
        simulatedAuthEnabled: true,
        internalLabEnabled: false,
        retentionSweepIntervalMs: 3_600_000,
        sessionTtlSeconds: 3_600,
        chatMediaStorage: { provider: "local", directory: resolve(dirname(options.output),"model-media") },
      },
      remoteChatProvider: provider,
      personResearchProvider: null,
      screenshotContact: null,
      labJobWorkerEnabled: false,
      labCIVerifier: null,
    });
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const client = new TalentSignalClient(base);

    for (const entry of frozen.cases.slice(0, options.maxCases)) {
      if (spentUsd + options.reservationUsd > options.maxEstimatedUsd) {
        report.totals.stopped = "estimated_budget";
        report.incomplete.push({ id: entry.id, reason: "budget_reservation_guard" });
        break;
      }
      const account = await makeAccount(pool, entry.id);
      const login = await client.login({ account_slug: account.auth.accountSlug, user_email: account.email, client_label: "get40-model-evaluation" });
      client.setAccessToken(login.access_token);

      let setup = null;
      try {
        const seeded = await seedCaseSetup(pool, client, account, entry);
        setup = seeded;
      } catch (error) {
        report.incomplete.push({ id: entry.id, reason: "setup_failed", message: error instanceof Error ? error.message : String(error) });
        await writeReport(options.output, report);
        continue;
      }

      const sessionId = randomUUID();
      const messageId = randomUUID();
      const now = new Date().toISOString();
      await client.saveAgentSession(sessionId, {
        expected_revision: 0,
        idempotency_key: sessionId,
        payload: {
          id: sessionId,
          scopeKind: setup.bound ? "relationship" : "unresolved_intent",
          ...(setup.bound ? {personID:setup.contact.personId,relationshipContextID:setup.contact.contextId} : {}),
          personDisplayLabel: setup.bound ? "陈宇" : "",
          contextDisplayLabel: "",
          title: `GET-40 synthetic ${entry.id}`,
          turns: [],
          updatedAt: now,
          isUnread: false,
        },
      });
      const started = Date.now();
      const record = {
        id: entry.id,
        input: entry.input,
        inputHash: caseInputHash(entry),
        expected: entry.expected,
        acceptedDeclared: entry.accepted,
        setup: setup.setup,
        sessionId,
        messageId,
        answer: null,
        memoryProposal: null,
        disposition: null,
        reviewable: false,
        reviewItemCount: null,
        tools: [],
        protocol: [],
        promptHashes: [],
        abort: new AbortController(),
        harnessStarted: false, harnessSettled: false,
        turns: 0,
        durationMs: null,
        inputTokens: null,
        outputTokens: null,
        sdkEstimatedUsd: null,
        usageComplete: true,
        transportFailure: null,
        timedOut: false,
      };
      currentCase = record;
      try {
        let turn = null;
        if (setup.bound) {
          record.admission="authenticated_relationship_chat";
          const result=await client.createChatTask({idempotency_key:randomUUID(),session_id:sessionId,message_id:messageId,objective:entry.input,
            person_id:setup.contact.personId,relationship_context_id:setup.contact.contextId,time_zone:"Asia/Shanghai"});
          record.answer=(result.blocks??[]).map(block=>block.body).join("\n\n");
          record.disposition=result.disposition;
          const current = await client.getAgentSession(sessionId);
          assert(current.session.payload, "Bound Session payload missing");
          const completedTurn = {
            id: messageId, objective: entry.input, createdAt: now,
            response: {
              contractVersion: result.contract_version, taskID: result.task_id,
              contextManifestID: result.context_manifest_id, knowledgeSnapshotID: result.knowledge_snapshot_id,
              disposition: result.disposition, createdAt: result.created_at,
              unboundConversationBlocks: result.blocks.slice(0,32).map(block => ({
                id: block.id, kind: block.kind, title: block.title, body: block.body, status: block.status,
                citation_dependency_ids: [], requires_user_decision: false, allows_static_share: false, target_ref: null,
              })),
              ...(result.memory_proposal ? { memoryProposal: result.memory_proposal } : {}),
            },
          };
          await client.saveAgentSession(sessionId, {
            expected_revision: current.session.revision, idempotency_key: messageId,
            payload: { ...current.session.payload, updatedAt: result.created_at,
              turns: [...current.session.payload.turns, completedTurn] },
          });
          turn = (await client.getAgentSession(sessionId)).session.payload.turns.find(item=>item.id===messageId);
          assert(turn, "Completed bound turn was not persisted");
        } else {
          record.admission="conversation_queue";
          await client.admitConversationQueueEntry({idempotency_key:randomUUID(),session_id:sessionId,message_id:messageId,objective:entry.input,time_zone:"Asia/Shanghai"});
          const deadline=Date.now()+options.queueTimeoutMs;
          while(Date.now()<deadline) {
            const snapshot=await client.getConversationQueue(sessionId);
            const active=[snapshot.active,...snapshot.queued].find(item=>item?.message_id===messageId);
            const session=await client.getAgentSession(sessionId);
            turn=session.session.payload?.turns.find(item=>item.id===messageId)??null;
            if(turn){record.queueStatus="completed";break;}
            if(active && ["failed","cancelled","interrupted"].includes(active.status)){record.queueStatus=active.status;record.transportFailure=active.failure_code??active.status;break;}
            if(record.harnessSettled && record.providerFailure){record.transportFailure=record.providerFailure;break;}
            await new Promise(resolve=>setTimeout(resolve,options.pollMs));
          }
          if(!turn && !record.transportFailure){
            record.timedOut=true;record.abort.abort(new Error("Evaluation deadline"));
            const snapshot=await client.getConversationQueue(sessionId);
            if(snapshot.active?.run_id) await client.mutateConversationQueue(sessionId,{kind:"stop",run_id:snapshot.active.run_id,expected_revision:snapshot.revision,idempotency_key:randomUUID()});
          }
        }
        if (turn) {
          record.answer = (turn.response.unboundConversationBlocks ?? []).map((block) => block.body).join("\n\n").slice(0, 12_000);
          record.disposition = turn.response.disposition;
          const reference = turn.response.memoryProposal;
          if (reference) {
            record.memoryProposal = reference;
            // Validate that the persisted reference is actually reviewable
            // through the real purpose-bound review endpoint.
            const opened = await client.openMemoryReview(reference.proposal_id, setup.bound
              ? { purpose: "people", person_id: setup.contact.personId, relationship_context_id: setup.contact.contextId }
              : { purpose: "chat" });
            record.reviewPurpose = setup.bound ? "people" : "chat";
            record.reviewable = true;
            record.reviewItemCount = opened.review.visible_item_count;
            record.reviewSourceStatus = opened.review.source_status;
            record.reviewItems = opened.review.items;
          }
        }
      } catch (error) {
        record.transportFailure = error instanceof Error ? error.message : String(error);
      } finally {
        if(record.harnessStarted && !record.harnessSettled){
          record.abort.abort(new Error("Evaluation stopping"));
          const terminalDeadline=Date.now()+10000;
          while(!record.harnessSettled && Date.now()<terminalDeadline)await new Promise(resolve=>setTimeout(resolve,50));
        }
        currentCase = null;
      }
      if (record.admission === "conversation_queue") {
        const rows=await pool.query("SELECT status,failure_code,run_id FROM conversation_queue_entries WHERE account_id=$1 AND session_id=$2 AND message_id=$3",[account.accountId,sessionId,messageId]);
        record.persistedQueue=rows.rows[0]??null;
        if(record.providerFailure && !record.transportFailure)record.transportFailure=record.providerFailure;
        if(record.persistedQueue && !["completed","failed","cancelled","interrupted"].includes(record.persistedQueue.status)) {
          record.transportFailure=record.transportFailure??"queue_not_terminal";record.usageComplete=false;
        }
      }
      record.durationMs = Date.now() - started;
      delete record.abort;
      record.semanticAdjudication="pending human review";
      report.cases.push(record);
      report.totals.casesRun += 1;
      if (typeof record.inputTokens === "number") report.totals.inputTokens += record.inputTokens;
      if (typeof record.outputTokens === "number") report.totals.outputTokens += record.outputTokens;
      if (record.usageComplete === false || record.timedOut) report.totals.usageUnknownCases += 1;
      const estimated = typeof record.sdkEstimatedUsd === "number" ? record.sdkEstimatedUsd : null;
      if (estimated !== null && record.usageComplete !== false && !record.timedOut) {
        report.totals.sdkEstimatedUsd += estimated;
        spentUsd += estimated;
      }
      await writeReport(options.output, report);
      if (record.timedOut || record.providerFailure?.includes("Timeout")) {
        report.totals.stopped = report.totals.stopped ?? "case_timeout";
        report.incomplete.push({ id: entry.id, reason: "case_timeout" });
        break;
      }
      if (estimated === null || record.usageComplete === false) {
        report.totals.stopped = report.totals.stopped ?? "usage_unavailable";
        report.incomplete.push({ id: entry.id, reason: "usage_unavailable" });
        break;
      }
    }
  } finally {
    if (app) await app.close();
    await pool.end();
  }

  await writeReport(options.output, report);
  process.stdout.write(`Ran ${report.totals.casesRun} GET-40 model cases. Report: ${options.output}\n`);
}

function endpointName(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return `postgres://${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "unknown";
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
