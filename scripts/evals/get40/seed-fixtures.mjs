#!/usr/bin/env node
/**
 * GET-40 bounded synthetic fixture seeder (parent-run).
 *
 * Creates isolated synthetic accounts, real admitted Sessions, real staged
 * Memory proposals (through the production staging domain) and a real Pursuit
 * role/evidence association. It writes a mode-0600 receipt with the synthetic
 * credential and exact Web URLs; nothing secret is printed to stdout.
 *
 * The backend and web hosts are started separately by the parent against the
 * same synthetic database. All fixture people and content are fictional.
 *
 * Usage:
 *   node scripts/evals/get40/seed-fixtures.mjs \
 *     --database postgres://get40_test@127.0.0.1:55440/get40_test \
 *     --web-origin http://127.0.0.1:55443 \
 *     --output /private/tmp/ai-test-get-40.G6UF0E/get40/fixture-receipt.json
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { encodePasswordCredential } from "../../../apps/backend/dist/modules/passwordCredential.js";
import { TalentSignalClient } from "../../../packages/contracts/dist/index.js";
import {
  resolveSessionSourceAuthority,
  stageMemoryProposal,
  openMemoryReview, commitMemoryReview, mutateMemoryItem,
} from "../../../apps/backend/dist/modules/memoryReview.js";

const require = createRequire(new URL("../../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const ARTIFACT_ROOT = fileURLToPath(new URL("./inputs/", import.meta.url));
let fixtureAccount = null;
const DEFAULT_OUTPUT = null;
const DEFAULT_BACKEND = "http://127.0.0.1:55442";
const PASSWORD = `get40-synthetic-${randomUUID().replace(/-/g, "").slice(0, 24)}!A`;

function parseArgs(argv) {
  const options = { database: null, webOrigin: "http://127.0.0.1:55443", backendBaseUrl: DEFAULT_BACKEND, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--database") options.database = value;
    else if (flag === "--web-origin") options.webOrigin = value;
    else if (flag === "--backend-base-url") options.backendBaseUrl = value;
    else if (flag === "--output") options.output = value;
    else throw new Error(`Unknown argument ${flag}`);
  }
  assert(options.output, "--output is required");
  assert(options.database, "--database is required");
  return options;
}

function assertOwnedSyntheticDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  assert(LOOPBACK.has(parsed.hostname), "Only a loopback synthetic database is admitted.");
  assert(/(?:^|\/)(get40_test|get40_eval|talent_signal_get40_test)$/.test(parsed.pathname), "Database name must be an owned synthetic get40 database.");
  assert(!/(production|prod|live)/i.test(parsed.pathname), "Refusing a production-looking database name.");
}

function assertLoopbackOrigin(origin) {
  const parsed = new URL(origin);
  assert(["http:", "https:"].includes(parsed.protocol), "Web origin must be http(s).");
  assert(LOOPBACK.has(parsed.hostname), "Web origin must be loopback.");
}

function assertLoopbackBackend(baseUrl) {
  const parsed = new URL(baseUrl);
  assert(parsed.protocol === "http:", "Fixture backend must be loopback http.");
  assert(LOOPBACK.has(parsed.hostname), "Fixture backend must be loopback.");
  assert(parsed.port === "55442", "Fixture backend must use the dedicated 55442 port.");
}

async function readArtifact(name) {
  return readFile(`${ARTIFACT_ROOT}/${name}`, "utf8");
}

async function readArtifactJson(name) {
  return JSON.parse(await readArtifact(name));
}

async function makePursuitWithEvidence(pool,auth,contact) {
  const pursuitId = randomUUID();
  await pool.query(
    `INSERT INTO pursuits(id, account_id, pursuit_type, title, target_outcome, target_date, status, milestone, milestone_authority_user_id, milestone_authority_at, created_by_user_id, updated_by_user_id)
     VALUES($1,$2,'recruiting','合成案例 · 设计合作','确认合作范围','2026-12-31','active','screen',$3,now(),$3,$3)`,
    [pursuitId, auth.accountId, auth.userId],
  );
  const roleId = randomUUID();
  await pool.query(
    `INSERT INTO pursuit_roles(id, account_id, pursuit_id, person_id, role_type, status, confidence, basis_kind, display_order, created_by_user_id)
     VALUES($1,$2,$3,$4,'candidate','active','confirmed','evidence_supported',0,$5)`,
    [roleId, auth.accountId, pursuitId, contact.personId, auth.userId],
  );
  const captureId = randomUUID();
  const resourceId = randomUUID();
  const fragmentId = randomUUID();
  await pool.query(
    `INSERT INTO captures(id, account_id, created_by_user_id, subject_id, assignment_id, source_kind, source_metadata, identity_status, identity_context, purpose, status)
     VALUES($1,$2,$3,$4,$5,'conversation_screenshot','{}'::jsonb,'bound','{}'::jsonb,'relationship_evidence','active')`,
    [captureId, auth.accountId, auth.userId, contact.personId, contact.contextId],
  );
  await pool.query(
    `INSERT INTO source_resources(id, account_id, capture_id, created_by_user_id, client_resource_id, resource_kind, input_channel, display_name, media_type, observed_at, retention_scope, processing_state)
     VALUES($1,$2,$3,$4,$5,'conversation_screenshot','chat','Pursuit source','image/png',now(),'relationship','ready')`,
    [resourceId, auth.accountId, captureId, auth.userId, `pursuit-assoc-${fragmentId}`],
  );
  await pool.query(
    `INSERT INTO evidence_fragments(id, account_id, capture_id, resource_id, fragment_kind, sequence, text_content, content_hash, locator, attributed_actor, attribution_status, parser_name, parser_version, status, review_status)
     VALUES($1,$2,$3,$4,'message',0,'Pursuit association evidence',$5,'{}'::jsonb,'unknown','confirmed','test','1','active','reviewed')`,
    [fragmentId, auth.accountId, captureId, resourceId, `hash-${fragmentId}`],
  );
  await pool.query(
    `INSERT INTO source_retention_receipts(receipt_id, account_id, capture_id, policy_version, requested_mode, effective_mode, source_scope, source_access_state, source_access_reason, retention_until, created_at)
     VALUES($1,$2,$3,'source-retention.v2','full_source','full_source','full_reviewed_source','available','review_completed',now() + interval '30 days',now())`,
    [randomUUID(), auth.accountId, captureId],
  );
  await pool.query(
    `INSERT INTO pursuit_role_evidence(account_id, role_id, evidence_fragment_id) VALUES($1,$2,$3)`,
    [auth.accountId, roleId, fragmentId],
  );
  return { pursuitId, roleId, fragmentId, captureId };
}
async function makeFixtureContact(pool,label,contextLabel="设计交流",handle=null) {
  const {auth}=fixtureAccount;const personId=randomUUID(),contextId=randomUUID();
  await pool.query("INSERT INTO subjects(id,account_id,external_ref,display_label,status) VALUES($1,$2,$3,$4,'active')",[personId,auth.accountId,`get40:${personId}`,label]);
  await pool.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label,status) VALUES($1,$2,$3,$4,$5,'active')",[contextId,auth.accountId,personId,`get40:${contextId}`,contextLabel]);
  if(handle)await pool.query(`INSERT INTO identity_handles(id,account_id,subject_id,handle_type,normalized_value_hash,display_hint,status,confirmed_by_user_id,freshness_policy_version,validity_basis,valid_until)
    VALUES($1,$2,$3,'source_native_id',$4,$5,'confirmed',$6,'identity-freshness-2026-08-07.v1','policy_default',now()+interval '180 days')`,[randomUUID(),auth.accountId,personId,sha256Hex(handle),handle,auth.userId]);
  return {personId,contextId};
}

function candidate(overrides) {
  const displayText = overrides.display_text;
  return {
    scope: overrides.scope ?? "self",
    operation: overrides.operation ?? "add",
    statement_kind: overrides.statement_kind ?? "fact",
    display_text: displayText,
    subject_id: null,
    relationship_context_id: null,
    speaker: overrides.speaker ?? null,
    reporter: overrides.reporter ?? null,
    valid_time: null,
    observed_time: null,
    time_status: overrides.time_status ?? "known",
    sensitivity: overrides.sensitivity ?? "normal",
    source_excerpt: overrides.source_excerpt ?? displayText,
    source_locator: { kind: "message", session_id: null, message_id: null },
    previous_memory_item_id: null,
    previous_text: null,
    previous_revision: null,
    reason: overrides.reason ?? "Synthetic fixture candidate useful in a later task.",
    ...overrides,
  };
}

async function makeAccount(pool, label) {
  const accountId = randomUUID();
  const userId = randomUUID();
  const username = `get40-${label}-${accountId.slice(0, 8)}`;
  const email = `${username}@synthetic.local`;
  const slug = `get40-fixture-${label}-${accountId.slice(0, 8)}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,$3)", [accountId, slug, `GET-40 synthetic ${label}`]);
  await pool.query(
    "INSERT INTO users(id,account_id,email,username,display_name,kind,account_role) VALUES($1,$2,$3,$4,$5,'password_human','member')",
    [userId, accountId, email, username, `Synthetic ${label}`],
  );
  await pool.query("INSERT INTO password_credentials(account_id,user_id,password_scrypt) VALUES($1,$2,$3)", [
    accountId,
    userId,
    await encodePasswordCredential(PASSWORD),
  ]);
  return {
    accountId,
    userId,
    username,
    email,
    password: PASSWORD,
    auth: {
      accountId,
      accountSlug: slug,
      userId,
      userEmail: email,
      userKind: "password_human",
      sessionId: randomUUID(),
    },
  };
}

async function insertAdmittedSession(pool, auth, { sessionId, messageId, objective, images }) {
  const iso = new Date().toISOString();
  const contents = images.map((image) => image.bytes);
  const hashes = contents.map((content) => createHash("sha256").update(content).digest("hex"));
  await pool.query(
    `INSERT INTO agent_sessions(account_id,id,created_by_user_id,revision,payload,created_at,expires_at)
     VALUES($1,$2,$3,1,$4::jsonb,now(),now() + interval '30 days')`,
    [
      auth.accountId,
      sessionId,
      auth.userId,
      JSON.stringify({
        id: sessionId,
        scopeKind: "unresolved_intent",
        personDisplayLabel: "",
        contextDisplayLabel: "",
        title: "合成场景 · GET-40 new17",
        updatedAt: iso,
        isUnread: false,
        turns: [
          {
            id: messageId,
            objective,
            response: {
              contractVersion: "2026-08-24.10",
              taskID: randomUUID(),
              contextManifestID: randomUUID(),
              knowledgeSnapshotID: randomUUID(),
              disposition: "answer",
              unboundConversationBlocks: [{id:randomUUID(),kind:"answer",title:"下一步",body:"先发文字方案，再确认讨论时间。尚未完成的承诺会保留为计划。",status:"unconfirmed",citation_dependency_ids:[],requires_user_decision:false}],
              createdAt: iso,
            },
            createdAt: iso,
            ...(images.length > 0
              ? {
                  images: images.map((image, index) => ({
                    attachment_id: image.attachmentId,
                    file_name: image.fileName,
                    media_type: image.mediaType,
                    byte_size: contents[index].length,
                    content_hash: hashes[index],
                  })),
                }
              : {}),
          },
        ],
      }),
    ],
  );
  if (images.length > 0) {
    const queueEntryId = randomUUID();
    await pool.query(
      "INSERT INTO conversation_queue_entries(account_id,session_id,id,message_id,created_by_user_id,sequence,status,content_state,objective,idempotency_key,expires_at) VALUES($1,$2,$3,$4,$5,1,'completed','retained',$6,$7,now() + interval '30 days')",
      [auth.accountId, sessionId, queueEntryId, messageId, auth.userId, objective.slice(0, 1000), `fixture-${queueEntryId}`],
    );
    for (const [index, image] of images.entries()) {
      await pool.query(
        "INSERT INTO conversation_message_images(account_id,session_id,message_id,queue_entry_id,image_index,attachment_id,file_name,media_type,byte_size,content_hash,content,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now() + interval '30 days')",
        [auth.accountId, sessionId, messageId, queueEntryId, index, image.attachmentId, image.fileName, image.mediaType, contents[index].length, hashes[index], contents[index]],
      );
    }
  }
}

async function attachProposalReference(pool, auth, sessionId, messageId, proposal) {
  const session = await pool.query("SELECT revision, payload FROM agent_sessions WHERE account_id=$1 AND id=$2", [auth.accountId, sessionId]);
  const payload = session.rows[0].payload;
  const turns = payload.turns.map((turn) =>
    turn.id === messageId
      ? { ...turn, response: { ...turn.response, memoryProposal: { proposal_id: proposal.proposal_id, revision: proposal.revision } } }
      : turn,
  );
  // Fixture seeding writes the display-only proposal reference directly; the
  // review itself is opened and committed through the production Web BFF.
  await pool.query(
    "UPDATE agent_sessions SET payload=$3::jsonb, revision=revision+1, updated_at=now() WHERE account_id=$1 AND id=$2",
    [auth.accountId, sessionId, JSON.stringify({ ...payload, turns, updatedAt: new Date().toISOString() })],
  );
}

/** Exact expected summary per source message; the excerpt stays the raw source. */
const SEVENTEEN_DISPLAY_TEXT = {
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

function itemScope(sequence) {
  if (sequence <= 2) return "self";
  if (sequence <= 10) return "person";
  return "relationship";
}

/** Build the 17 candidates from the exact admitted source messages. */
async function seventeenItems() {
  const source = await readArtifactJson("seventeen-source.json");
  const messages = Array.isArray(source.messages) ? source.messages : [];
  assert(messages.length === 17, "seventeen-source.json must contain 17 messages");
  return messages.map((message) => {
    const scope = itemScope(message.sequence);
    return candidate({
      scope,
      statement_kind: scope === "self" ? "user_opinion" : "source_statement",
      speaker: message.speaker,
      display_text: SEVENTEEN_DISPLAY_TEXT[message.id] ?? message.text,
      source_excerpt: message.text,
      time_status: ["m7","m12","m14","m15","m16"].includes(message.id) ? "future" : "known",
      reason:
        scope === "self"
          ? "用户明确表达的偏好或当前计划，之后可直接复用。"
          : scope === "person"
            ? "陈宇在这次对话里陈述的当前状态，保留说话者归属。"
            : "我们之间尚未完成的约定或待定计划，保留时间与方向。",
    });
  });
}

async function loadAdmittedImages() {
  const specs = [
    { file: "source-1.jpg", display: "source-1.jpg" },
    { file: "source-2.jpg", display: "source-2.jpg" },
  ];
  const images = [];
  for (const spec of specs) {
    let bytes = null;
    for (const directory of [
      ARTIFACT_ROOT,
    ]) {
      try {
        bytes = await readFile(`${directory}/${spec.file}`);
        break;
      } catch {
        // Try the next owned location.
      }
    }
    assert(bytes && bytes.length > 3, `fixture image ${spec.file} was not found in an owned location`);
    // The CUA screenshots are JPEG bytes despite their .png suffix; admit the
    // real media type rather than mislabelling the format.
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    images.push({
      attachmentId: randomUUID(),
      bytes,
      mediaType: isJpeg ? "image/jpeg" : "image/png",
      fileName: isJpeg ? spec.display : spec.file,
    });
  }
  return images;
}

async function seedMemoriesScenario(pool, webOrigin, label = "text", options = {}) {
  const account = fixtureAccount ?? await makeAccount(pool, label);
  const sessionId = randomUUID();
  const messageId = randomUUID();
  const items = options.items ?? await seventeenItems();
  const source = await readArtifactJson("seventeen-source.json");
  // The admitted source is the exact 17 messages with speaker attribution; the
  // two synthetic screenshots are admitted with their real media type.
  const sourceText = options.sourceText ?? source.messages
    .map((message) => `${message.speaker}：${message.text}`)
    .join("\n");
  const images = label === "text" ? [] : await loadAdmittedImages();
  await insertAdmittedSession(pool, account.auth, { sessionId, messageId, objective: sourceText, images });
  const authority = await resolveSessionSourceAuthority(pool, account.auth, sessionId, messageId);
  const staged = await stageMemoryProposal(
    pool,
    account.auth,
    {
      idempotency_key: randomUUID(),
      surface: "chat",
      session_id: sessionId,
      source_task_id: null,
      source_message_id: messageId,
      person_id: options.contact?.personId ?? null,
      relationship_context_id: options.contact?.contextId ?? null,
      contact_decision: options.contact ? "existing" : "new",
      identity_authority: options.contact ? "human_selection" : "tentative",
      identity_clue: { type: "source_native_id", value: "chenyu_demo" },
      new_contact: options.contact ? null : { display_label: "陈宇", relationship_context: "设计交流" },
      proposer: { kind: "human", name: "get40-synthetic-fixture", version: "1" },
      items,
    },
    authority,
  );
  assert(staged, "fixture proposal was not staged");
  await attachProposalReference(pool, account.auth, sessionId, messageId, staged.proposal);
  if (options.expireSource) {
    // Keep the Session page renderable while making the bound source no longer
    // match, so the review truthfully reports an unavailable source.
    const session = await pool.query("SELECT payload FROM agent_sessions WHERE account_id=$1 AND id=$2", [account.auth.accountId, sessionId]);
    const payload = session.rows[0].payload;
    const turns = payload.turns.map((turn) =>
      turn.id === messageId
        ? { ...turn, objective: `${turn.objective}\n（来源已被替换）` }
        : turn,
    );
    await pool.query(
      "UPDATE agent_sessions SET payload=$3::jsonb, revision=revision+1, updated_at=now() WHERE account_id=$1 AND id=$2",
      [account.auth.accountId, sessionId, JSON.stringify({ ...payload, turns })],
    );
  }
  return {
    scenario: options.expireSource ? "sourceexpired" : label === "text" ? "text17" : label,
    synthetic: true,
    provider: "direct-domain-stage",
    username: account.username,
    email: account.email,
    password: account.password,
    sessionId,
    messageId,
    accountId: account.accountId,
    ...(options.contact ? {personId:options.contact.personId,contextId:options.contact.contextId,webPeopleUrl:`${webOrigin}/workspace/people/${options.contact.personId}`} : {}),
    proposalId: staged.proposal.proposal_id,
    proposalRevision: staged.proposal.revision,
    itemCount: staged.proposal.item_count,
    webSessionUrl: `${webOrigin}/workspace/sessions/${sessionId}`,
  };
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Main scenario: exact original source admitted through the production
 * conversation queue, executed by the deterministic fixture provider which
 * invokes the real memory_review tool, then persisted as a real completed
 * Session turn with its Memory reference.
 */
async function seedQueueScenario(pool, options, imagesOnly = false) {
  const account = fixtureAccount ?? await makeAccount(pool, "queue");
  const client = new TalentSignalClient(options.backendBaseUrl);
  await client.signInWithPassword({
    identifier: account.email,
    password: account.password,
    client_label: "get40-fixture-seed",
  });
  const source = await readArtifactJson("seventeen-source.json");
  const objective = imagesOnly ? "" : source.messages
    .map((message) => `${message.speaker}：${message.text}`)
    .join("\n");
  const images = await loadAdmittedImages();
  const uploads = images.map((image) => ({
    attachment_id: randomUUID(),
    file_name: image.fileName,
    media_type: image.mediaType,
    byte_size: image.bytes.length,
    content_hash: sha256Hex(image.bytes),
    data_base64: image.bytes.toString("base64"),
  }));
  {
    const sessionId = randomUUID();
    const messageId = randomUUID();
    const now = new Date().toISOString();
    await client.saveAgentSession(sessionId, {
      expected_revision: 0,
      idempotency_key: sessionId,
      payload: {
        id: sessionId,
        scopeKind: "unresolved_intent",
        personDisplayLabel: "",
        contextDisplayLabel: "",
        title: "合成场景 · GET-40 main17",
        turns: [],
        updatedAt: now,
        isUnread: false,
      },
    });
    await client.admitConversationQueueEntry({
      idempotency_key: randomUUID(),
      session_id: sessionId,
      message_id: messageId,
      objective,
      time_zone: "Asia/Shanghai",
      images: uploads,
    });
    const deadline = Date.now() + 90_000;
    let turn = null;
    let failed = false;
    while (Date.now() < deadline) {
      const snapshot = await client.getConversationQueue(sessionId);
      const entry = [snapshot.active,...snapshot.queued].find((item) => item?.message_id === messageId);
      if (entry && ["failed", "cancelled", "interrupted"].includes(entry.status)) {
        failed = true;
        break;
      }
      const session = await client.getAgentSession(sessionId);
      const found = session.session.payload?.turns.find((record) => record.id === messageId);
      if (found?.response?.memoryProposal) {
        turn = found;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (turn) {
      const proposal = turn.response.memoryProposal;
      const answerBlocks = (turn.response.unboundConversationBlocks ?? []).map((block) => block.body);
      assert(answerBlocks.join("\n").trim().length > 0, "main17 queue run returned an empty answer");
      return {
        scenario: imagesOnly ? "pure-images" : "main17",
        synthetic: true,
        provider: "get40-fixture-deterministic",
        username: account.username,
        email: account.email,
        password: account.password,
        sessionId,
        messageId,
        proposalId: proposal.proposal_id,
        proposalRevision: proposal.revision,
        itemCount: 17,
        answer: answerBlocks.join("\n\n"),
        webSessionUrl: `${options.webOrigin}/workspace/sessions/${sessionId}`,
      };
    }
    if (failed) throw new Error("The exact main17 queue entry failed; inspect it before another run.");
  }
  throw new Error("main17 queue run did not produce a completed Session turn with a Memory reference");
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertOwnedSyntheticDatabase(options.database);
  assertLoopbackOrigin(options.webOrigin);
  assertLoopbackBackend(options.backendBaseUrl);
  // Reuse the frozen review inputs so the fixture scenarios stay aligned with
  // the accepted synthetic case set.
  const frozen = await readArtifactJson("frozen-cases.json");
  assert(Array.isArray(frozen.cases) && frozen.cases.length === 20, "frozen-cases.json must contain 20 cases");
  const pool = new Pool({ connectionString: options.database, max: 4, idleTimeoutMs: 0 });
  try {
    fixtureAccount = await makeAccount(pool,"review");
    const scenarios = [];
    // The main scenario goes through real production queue admission and the
    // deterministic fixture provider; a text-only scenario remains for the
    // independent text cases.
    scenarios.push(await seedQueueScenario(pool, options));
    fixtureAccount = await makeAccount(pool,"images");
    scenarios.push(await seedQueueScenario(pool, options,true));
    fixtureAccount = await makeAccount(pool,"text");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "text"));
    fixtureAccount = await makeAccount(pool,"person21");
    const person21=await readArtifactJson("person21.json");
    scenarios.push(await seedMemoriesScenario(pool,options.webOrigin,"person21",{items:person21.map(text=>candidate({scope:"person",statement_kind:"source_statement",speaker:"陈宇",display_text:`陈宇说，${text.replace(/^我/u,"他")}`,source_excerpt:text,time_status:text.includes("计划下个月")?"future":"known",reason:"后续设计沟通时保留原有限定条件。"})),sourceText:person21.map(text=>`陈宇：${text}`).join("\n")}));
    // Independent copies so one browser action cannot contaminate another
    // scenario; each uses its own synthetic account and proposal.
    fixtureAccount = await makeAccount(pool,"contactonly");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "contactonly"));
    fixtureAccount = await makeAccount(pool,"skiprestore");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "skiprestore"));
    fixtureAccount = await makeAccount(pool,"dismiss");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "dismiss"));
    fixtureAccount = await makeAccount(pool,"undo");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "undo"));
    fixtureAccount = await makeAccount(pool,"expired");
    scenarios.push(await seedMemoriesScenario(pool, options.webOrigin, "expired", { expireSource: true }));
    fixtureAccount = await makeAccount(pool,"business");
    const contact=await makeFixtureContact(pool,"陈宇","设计交流","chenyu_design");
    const association=await makePursuitWithEvidence(pool,fixtureAccount.auth,contact);
    const business=await seedMemoriesScenario(pool,options.webOrigin,"relationship-six",{contact});
    scenarios.push({...business,pursuitId:association.pursuitId,webPursuitUrl:`${options.webOrigin}/workspace/pursuits/${association.pursuitId}`});
    await makeFixtureContact(pool,"陈宇","增长团队","chenyu_growth");
    await makeFixtureContact(pool,"失败演示","重试验证","failure_demo");
    scenarios.push(await seedMemoriesScenario(pool,options.webOrigin,"identity-success"));
    scenarios.push(await seedMemoriesScenario(pool,options.webOrigin,"identity-failure"));
    // Previous accepted values are real commits, then real user corrections
    // advance them to v2 before an update/contest proposal is generated.
    const prior=await seedMemoriesScenario(pool,options.webOrigin,"previous-values",{contact,sourceText:"陈宇：我计划周五发原型。陈宇：本周五交付组件清单。",
      items:[candidate({scope:"person",statement_kind:"source_statement",speaker:"陈宇",display_text:"陈宇计划周五发原型。",source_excerpt:"我计划周五发原型。",time_status:"future"}),candidate({scope:"person",statement_kind:"source_statement",speaker:"陈宇",display_text:"陈宇说本周五交付组件清单。",source_excerpt:"本周五交付组件清单。",time_status:"future"})]});
    const opened=await openMemoryReview(pool,fixtureAccount.auth,prior.proposalId,{purpose:"chat"});
    const accepted=await commitMemoryReview(pool,fixtureAccount.auth,opened.review.review_scope_id,opened.review_credential,{idempotency_key:randomUUID(),expected_proposal_revision:opened.review.proposal_revision,contact_decision:"existing",identity_authority:"human_selection",selected_item_ids:opened.review.items.map(item=>item.id),edited_text:{},item_decisions:{},expected_item_versions:{},reason:"Synthetic accepted baseline"});
    const previous=[];
    for(const id of accepted.body.receipt.created_item_ids) {
      const current=(await pool.query("SELECT * FROM memory_items WHERE id=$1",[id])).rows[0];
      const corrected=await mutateMemoryItem(pool,fixtureAccount.auth,id,{operation:"correct",idempotency_key:randomUUID(),expected_version:1,display_text:current.display_text,reason:"Confirm exact scope"});
      previous.push(corrected.item);
    }
    const sourceText="陈宇：原型已经在周四发出。本周完全不交付组件清单，请保留这个矛盾。";
    const changeItems=previous.map(item=>candidate({scope:"person",operation:item.display_text.includes("原型")?"update":"contest",statement_kind:"source_statement",speaker:"陈宇",display_text:item.display_text.includes("原型")?"陈宇说原型已在周四发出。":"陈宇说本周完全不交付组件清单。",source_excerpt:item.display_text.includes("原型")?"原型已经在周四发出。":"本周完全不交付组件清单",time_status:item.display_text.includes("原型")?"past":"future",previous_memory_item_id:item.id,previous_text:item.display_text,previous_revision:item.version,reason:"与之前的计划比较，交付状态有明确变化。"}));
    scenarios.push(await seedMemoriesScenario(pool,options.webOrigin,"update-and-conflict",{contact,sourceText,items:changeItems}));

    const receipt = {
      fixture: "get40-synthetic-fixtures.v1",
      createdAt: new Date().toISOString(),
      dataClass: "synthetic",
      credentialFileMode: "0600",
      note: "Synthetic-only account. Credentials must never be committed or copied into documentation.",
      webOrigin: options.webOrigin,
      scenarios,
    };
    await writeReceipt(options.output, receipt);
    process.stdout.write(
      `Seeded ${scenarios.length} synthetic GET-40 scenario(s). Receipt: ${options.output}\n` +
        `Scenario ${scenarios[0].scenario}: ${scenarios[0].webSessionUrl}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
