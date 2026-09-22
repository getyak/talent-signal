#!/usr/bin/env node
/**
 * GET-40 isolated fixture backend host (parent-run).
 *
 * Starts the production backend against the owned synthetic database on
 * 127.0.0.1:55442 with a clearly synthetic deterministic provider. The
 * provider stages the exact seventeen-source review only when the admitted
 * source matches, and returns a useful answer. Normal product routes,
 * authorization, queue completion and the Memory review BFF stay production.
 * This provider is fixture evidence only, never model-quality evidence.
 *
 * Usage:
 *   DATABASE_URL=postgres://get40_test@127.0.0.1:55440/get40_test \
 *     node scripts/evals/get40/fixture-server.mjs
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

import { ScriptedAgentProvider } from "../../../apps/agent/dist/index.js";
import { buildApp } from "../../../apps/backend/dist/app.js";

const require = createRequire(new URL("../../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const HOST = "127.0.0.1";
const PORT = Number(process.env.GET40_FIXTURE_PORT ?? 55442);
const MEDIA_DIR = process.env.GET40_MEDIA_DIR;
const ARTIFACT_ROOT = fileURLToPath(new URL("./inputs/", import.meta.url));

const DISPLAY_TEXT = {
  m1: "用户要求回复先给结论，再解释理由。",
  m2: "用户做决定前希望先看一个具体案例。",
  m3: "用户这季度在寻找设计合作者，下季度还没决定。",
  m4: "陈宇说，他目前负责设计系统。",
  m5: "陈宇说，他现在在上海工作。",
  m6: "陈宇说，他工作日通常晚上六点以后方便沟通。",
  m7: "陈宇说，他计划下个月换到增长团队，现在还没换。",
  m8: "陈宇说，分享设计材料时请优先给他 Figma 链接。",
  m9: "陈宇说，他目前每周四要主持设计评审。",
  m10: "陈宇说，他今年主要研究无障碍设计。",
  m11: "陈宇说，公开引用他分享的材料前需要先让他确认。",
  m12: "我答应这周五把原型发给陈宇，目前还没有发送。",
  m13: "陈宇要求这次先看文字方案，看过后再决定是否约讨论。",
  m14: "我们这周四先通过文字确认讨论时间，还没约定具体时刻。",
  m15: "我承诺在下周二之前整理三个案例给陈宇。",
  m16: "陈宇答应下周提供组件清单，现在还没有整理完。",
  m17: "我们这次先验证一条设计流程，还没决定是否正式合作。",
};

const FIXTURE_ANSWER = "先把文字方案发给陈宇，并在周四确认讨论时间。周五的原型和下周的组件清单都还未完成；下个月转组也只是计划。";

function assertOwnedSyntheticDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  assert(LOOPBACK.has(parsed.hostname), "Only a loopback synthetic database is admitted.");
  assert(/(?:^|\/)(get40_test|get40_eval|talent_signal_get40_test)$/.test(parsed.pathname), "Database name must be an owned synthetic get40 database.");
  assert(!/(production|prod|live)/i.test(parsed.pathname), "Refusing a production-looking database name.");
}

function itemScope(sequence) {
  if (sequence <= 2) return "self";
  if (sequence <= 10) return "person";
  return "relationship";
}

const FUTURE_MESSAGE_IDS = new Set(["m7", "m12", "m14", "m15", "m16"]);

function itemReason(message) {
  const scope = itemScope(message.sequence);
  if (FUTURE_MESSAGE_IDS.has(message.id)) {
    return "这是一项尚未发生的计划或约定；当前状态仍保留，之后再核对。";
  }
  if (scope === "self") return "用户明确表达的偏好或当前计划，之后可直接复用。";
  if (scope === "person") return "陈宇在这次对话里陈述的当前状态，保留说话者归属。";
  return "我们之间已确认或待确认的事项，保留时间与方向。";
}

async function buildFixtureProvider() {
  const source = JSON.parse(await readFile(`${ARTIFACT_ROOT}/seventeen-source.json`, "utf8"));
  const items = source.messages.map((message) => ({
    scope: itemScope(message.sequence),
    operation: "add",
    statement_kind: message.sequence <= 2 ? "user_opinion" : "source_statement",
    dependence_kind:
      message.sequence <= 2 ? "independent_self" : itemScope(message.sequence) === "person" ? "contact" : "relationship",
    display_text: DISPLAY_TEXT[message.id] ?? message.text,
    speaker: message.speaker,
    // A plan or promise that has not happened yet is `future`, never a current
    // fact; the original wording is preserved in the excerpt.
    time_status: FUTURE_MESSAGE_IDS.has(message.id) ? "future" : "known",
    sensitivity: "normal",
    source_excerpt: message.text,
    source_locator: { kind: "message" },
    reason: itemReason(message),
  }));
  const makeScripted = (candidates, locator) => new ScriptedAgentProvider(
    [
      {
        tool: "memory_review",
        input: {
          operation: "propose",
          contact_decision: "new",
          person_display_label: source.contact.name,
          relationship_display_label: "设计交流",
          items: candidates,
          ...(locator ? {new_contact_source_locator:locator} : {}),
        },
      },
    ],
    () => ({ outcome: "reply", title: "已整理这段对话", body: FIXTURE_ANSWER }),
  );
  const hashes = await Promise.all(["source-1.jpg","source-2.jpg"].map(async name=>createHash("sha256").update(await readFile(`${ARTIFACT_ROOT}/${name}`)).digest("hex")));
  return {
    id: "get40-fixture-deterministic",
    providerId: "zhipu-chat-completions",
    model: "talent-signal-get40-fixture-v1",
    sdkVersion: "get40-fixture.v1",
    supportsImageInput: true,
    inputCapabilities: { text: true, image: true },
    async run(request, invokeTool, signal) {
      if(request.systemPrompt.startsWith("You regenerate review-only Memory candidates")) {
        const context=JSON.parse(request.objective);
        if(context.target_person_label==="失败演示")throw new Error("SYNTHETIC_REGENERATION_FAILURE");
        const original=context.admitted_source_text??"";
        const existing=new Set((context.existing_accepted_memory??[]).map(text=>text.normalize("NFKC")));
        const regenerated=items.filter(item=>item.scope!=="self" && original.includes(item.source_excerpt) && !existing.has(item.display_text.normalize("NFKC")));
        return {structuredOutput:{items:regenerated},inputTokens:0,outputTokens:0,estimatedUsd:0,turns:1,permissionDenials:[]};
      }
      const images=(request.inputParts??[]).filter(part=>part.kind==="image");
      const imageOnly=images.length===2 && images.every((part,index)=>part.contentHash===hashes[index]);
      const isMainSource = request.objective.includes(source.messages[0].text) || imageOnly;
      if (!isMainSource) {
        return {
          structuredOutput: {
            outcome: "reply",
            title: "夹具回复",
            body: "这是确定性合成夹具回复；本轮没有匹配可整理的记忆来源，因此没有生成记忆卡。",
          },
          inputTokens: 0,
          outputTokens: 0,
          estimatedUsd: 0,
          turns: 0,
          permissionDenials: [],
          terminalReason: "completed",
        };
      }
      const locator=index=>({kind:"image_region",artifact_id:images[index].artifactID,image_index:index});
      const candidates=imageOnly ? items.map((item,index)=>({...item,source_locator:locator(index<11?0:1)})) : items;
      return makeScripted(candidates,imageOnly?locator(0):null).run(request, invokeTool, signal);
    },
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert(databaseUrl, "DATABASE_URL is required and must point at the synthetic get40 database.");
  assertOwnedSyntheticDatabase(databaseUrl);
  assert(MEDIA_DIR,"GET40_MEDIA_DIR must be an owned artifact directory");
  await mkdir(MEDIA_DIR, { recursive: true });
  const pool = new Pool({ connectionString: databaseUrl, max: 8, idleTimeoutMillis: 0 });
  const provider = await buildFixtureProvider();
  process.stdout.write(`GET-40 fixture provider ready: ${Boolean(provider?.run)}.\n`);
  const app = await buildApp({
    pool,
    config: {
      databaseUrl,
      host: HOST,
      port: PORT,
      allowedOrigins: [],
      appleSignInAudiences: [],
      appleSignInEnabled: false,
      passwordAuthEnabled: true,
      passwordRegistrationEnabled: true,
      simulatedAuthEnabled: true,
      internalLabEnabled: false,
      retentionSweepIntervalMs: 3_600_000,
      sessionTtlSeconds: 3_600,
      chatMediaStorage: { provider: "local", directory: MEDIA_DIR },
    },
    remoteChatProvider: provider,
    personResearchProvider: null,
    screenshotContact: null,
    labJobWorkerEnabled: false,
    labCIVerifier: null,
  });
  let address;
  try { address = await app.listen({ host: HOST, port: PORT }); }
  catch(error) { await app.close(); await pool.end(); throw error; }
  process.stdout.write(`GET-40 fixture backend on ${address} (synthetic database only).\n`);
  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
