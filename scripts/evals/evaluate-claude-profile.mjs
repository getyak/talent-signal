import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ClaudeContactAgentModel, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness, claudeHarnessInterruptionCode } from "../../apps/agent/dist/index.js";
import { CONTRACT_VERSION, TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";
import { profileMemoryEvidence, verifyProfileMemory } from "./profile-memory-proof.mjs";
const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");
const args = process.argv.slice(2);
assert(args.length === 8 && args[0] === "--endpoint" && args[2] === "--model" && args[4] === "--database" && args[6] === "--output", "Expected endpoint/model/owned database/output arguments.");
const database = new URL(args[5]);
assert(database.hostname === "127.0.0.1" && database.pathname === "/get9_eval", "Only the owned synthetic database is admitted.");
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
const data = await readFile(new URL("./fixtures/get9-profile.png", import.meta.url));
const image = { media_type: "image/png", byte_size: data.length, content_hash: createHash("sha256").update(data).digest("hex"), data_base64: data.toString("base64") };
const report = { evaluation: "get9-profile.v1", createdAt: new Date().toISOString(), configuration: claudeHarnessConfigurationReceipt(configuration),
  fixture: { dataClass: "synthetic", imageHash: image.content_hash, name: "陈夏", company: "LatticeWorks", handle: "chenxia_design", platform: "Demo Social" },
  rubric: { version: "get9-quality-v1", minimumEachDimension: 3, scale: [0,1,2,3,4],
    dimensions: ["task_completion","grounding","naturalness","recovery"], recovery: "not_exercised unless a fault and recovery are observed" },
  trials: [], qualityReview: { status: "pending_independent_review" }, releaseReady: false };
const pool = new Pool({ connectionString: args[5], max: 4, idleTimeoutMillis: 0 });
let active, app;
const runtimeCompletions = new Map();
const model = new ClaudeContactAgentModel(configuration, async (config, request, signal) => {
  const target = active, taskID = JSON.parse(request.context).response.task_id;
  let complete;
  runtimeCompletions.set(taskID, new Promise(resolve => { complete = resolve; }));
  target.originalImageHash = request.images[0].contentHash;
  target.effort = request.effort ?? "high"; target.skillHash = createHash("sha256").update(JSON.stringify(request.skills ?? [])).digest("hex"); target.effectivePromptHash = createHash("sha256").update(request.systemPrompt).digest("hex");
  target.budget = request.budget;
  const observed = { ...request, tools: request.tools.map(tool => ({ ...tool, execute: async (...input) => {
    const result = await tool.execute(...input); target.tools.push({ name: tool.name, input: input[0], result }); return result;
  } })) };
  try { target.receipt = await runClaudeHarness(config, observed, signal, undefined, null); return target.receipt; }
  catch(error) { target.sdkFailure = { code: claudeHarnessInterruptionCode(error), receipt: error.receipt }; throw error; }
  finally { complete(); }
});
try {
  app = await buildApp({ pool, config: { databaseUrl: args[5], host: "127.0.0.1", port: 0,
    allowedOrigins: [], appleSignInAudiences: [], appleSignInEnabled: false, passwordAuthEnabled: false, passwordRegistrationEnabled: false,
    simulatedAuthEnabled: true, internalLabEnabled: false, retentionSweepIntervalMs: 3_600_000, sessionTtlSeconds: 3600,
    chatMediaStorage: { provider: "local", directory: "/tmp/get9-profile-synthetic-media" } },
    remoteChatProvider: null, personResearchProvider: null, screenshotContact: { model, research: null }, labJobWorkerEnabled: false, labCIVerifier: null });
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  for (let trial = 1; trial <= 3; trial++) {
    const account = randomUUID(), user = randomUUID(), slug = `get9-profile-${randomUUID()}`;
    await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic GET-9 profile')",[account,slug]);
    await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'profile@synthetic.local','Synthetic owner','simulated_human')",[user,account]);
    const client = new TalentSignalClient(base), login = await client.login({ account_slug: slug, user_email: "profile@synthetic.local", client_label: "get9-synthetic-profile-evaluation" });
    const request = async (path, body) => {
      const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${login.access_token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json(); if (!response.ok) {
        active.httpFailure = { status: response.status, operation: path.endsWith("profile-confirmation") ? "profile_confirmation" : "task_request" };
        throw new Error("PROFILE_HTTP_FAILURE");
      } return value;
    };
    const peopleCount = async () => Number((await pool.query("SELECT count(*) FROM subjects WHERE account_id=$1 AND status='active'",[account])).rows[0].count);
    let originalContact, memory;
    for (const caseID of ["E02", "E04"]) {
      active = { caseID, trial, tools: [], accountID: account }; const started = Date.now();
      try {
        const before = await peopleCount();
        const created = await request("/v1/contact-agent/tasks", { idempotency_key: randomUUID(), objective: caseID === "E02"
          ? "把这张个人主页整理成可编辑的联系人草稿。" : "这还是陈夏，整理这张主页并补充到已有联系人，不要重复新建。",
          image, captured_at: new Date().toISOString(), allow_public_research: false });
        let draft = created;
        while (draft.status === "running" && Date.now() - started < 360_000) { await delay(1000); draft = await request(`/v1/contact-agent/tasks/${created.task_id}`); }
        await runtimeCompletions.get(created.task_id);
        // The SDK terminal result precedes the product runner's receipt transaction.
        // Wait for that transaction and re-read its current revision before review.
        if (active.receipt) {
          while (Date.now() - started < 360_000) {
            const receipts = (await pool.query("SELECT jsonb_array_length(state->'model_receipts') AS count FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2", [account, created.task_id])).rows[0]?.count;
            if (receipts > 0) break;
            await delay(100);
          }
        }
        draft = await request(`/v1/contact-agent/tasks/${created.task_id}`);
        active.draft = draft;
        const fields = draft.contact_draft?.fields ?? [];
        const checks = { sdkCompleted: Boolean(active.receipt), actualModelMatched: active.receipt?.reportedModels.length === 1 && active.receipt.reportedModels[0] === configuration.model.replace(/^anthropic\//u, ""),
          originalImageReachedMainAgent: active.originalImageHash === image.content_hash,
          editableDraft: draft.status === "waiting_for_user" && Boolean(draft.contact_draft),
          noPersonWriteBeforeReview: await peopleCount() === before,
          nameExact: draft.contact_draft?.display_name === report.fixture.name,
          companyExact: fields.some(f => f.kind === "company" && f.value === report.fixture.company && f.source_excerpt.includes(report.fixture.company)),
          handleExact: fields.some(f => f.kind === "handle" && f.value.replace(/^@/u, "") === report.fixture.handle && f.source_excerpt.includes(report.fixture.handle)),
          noInventedMessages: draft.message_count === 0 && draft.extraction?.messages.length === 0,
          noExternalEffects: draft.external_effects.length === 0 };
        active.checks = checks;
        if (checks.editableDraft) {
          // Explicit evaluator-owned human intent, limited to this synthetic account.
          const confirmation = { expected_revision: draft.revision, decision: "save_reviewed_profile", display_name: report.fixture.name,
            fields: fields.map(f => ({ clue_index: f.clue_index, value: f.kind === "company" ? "LatticeWorks Studio" : f.value })) };
          const saved = await request(`/v1/contact-agent/tasks/${draft.task_id}/profile-confirmation`, confirmation);
          active.confirmation = confirmation; active.saved = saved;
          checks.confirmationReadback = saved.status === "completed" && (await request(`/v1/contact-agent/tasks/${draft.task_id}`)).revision === saved.revision;
          checks.exactEditedValueStored = (await pool.query("SELECT 1 FROM evidence_fragments WHERE capture_id=$1 AND text_content='LatticeWorks Studio'",[saved.capture_id])).rowCount === 1;
          checks.originalQuotePreserved = saved.extraction.identity_clues.some(f => f.kind === "company" && f.source_excerpt.includes("LatticeWorks") && !f.source_excerpt.includes("Studio"));
          if (caseID === "E02" && saved.status === "completed" && saved.contact) {
            checks.createdOnce = await peopleCount() === 1; originalContact = saved.contact;
            const resourceID = randomUUID(), now = new Date().toISOString();
            const capture = await client.createResourceCapture({ contract_version: CONTRACT_VERSION, idempotency_key: randomUUID(), channel: "chat",
              purpose: "Synthetic reviewed Memory preservation fixture", captured_at: now, source_timezone: "Asia/Shanghai",
              person_scope: { status: "confirmed", person_id: originalContact.person_id,
                relationship_context: { status: "existing", relationship_context_id: originalContact.relationship_context_id }, binding_basis: "Explicit synthetic evaluator review." },
              resource: { client_resource_id: resourceID, kind: "personal_note", display_name: "Synthetic reviewed commitment", media_type: "text/plain", observed_at: now,
                source_timezone: "Asia/Shanghai", retention: { requested_mode: "ephemeral", source_scope: "reviewed_selected_text" } },
              fragments: [{ client_resource_id: resourceID, kind: "note_revision", sequence: 0, text: "我答应周五给陈夏发原型。", locator: { kind: "note_revision", revision: 1 },
                attribution: { actor_kind: "recruiter", status: "confirmed" }, review_status: "reviewed", parser: { name: "synthetic-human-note", version: "1" } }] });
            const snapshot = await client.compileKnowledge(originalContact.person_id, originalContact.relationship_context_id, { idempotency_key: randomUUID(), objective: "Preserve this sourced synthetic commitment." });
            memory = { captureID: capture.capture_id, snapshotID: snapshot.id, snapshotHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
              evidence: await profileMemoryEvidence(pool, account, capture.capture_id) };
            active.memory = memory;
          } else if (caseID === "E04") {
            checks.stablePersonReused = saved.contact?.person_id === originalContact?.person_id && saved.contact?.disposition === "reused";
            checks.personCountUnchanged = await peopleCount() === before && before === 1;
            if (originalContact && memory) {
              active.memoryReadback = await verifyProfileMemory({ pool, client, accountID: account, contact: originalContact, memory });
              Object.assign(checks, active.memoryReadback.checks);
            } else {
              checks.priorMemoryFixtureAvailable = false;
            }
          }
        }
        active.checks = checks; active.status = Object.values(checks).every(Boolean) ? "checks_passed" : "checks_failed";
      } catch(error) { active.status = "failed"; active.errorCode = active.sdkFailure?.code ?? "EVALUATION_OR_PRODUCT_FAILURE"; }
      active.durationMs = Date.now() - started; report.trials.push(active);
      await writeFile(args[7], JSON.stringify(report,null,2)+"\n",{mode:0o600});
      console.log(JSON.stringify({caseID,trial,status:active.status}));
    }
  }
} finally { await app?.close(); await pool.end(); }
if(report.trials.length !== 6 || report.trials.some(trial => trial.status !== "checks_passed")) process.exitCode = 1;
