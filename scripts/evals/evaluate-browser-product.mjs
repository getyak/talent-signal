import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ClaudeContactAgentModel, claudeHarnessConfiguration, runClaudeHarness } from "../../apps/agent/dist/index.js";
import { TalentSignalClient } from "../../packages/contracts/dist/index.js";
import { buildApp } from "../../apps/backend/dist/app.js";
import { LocalContactResearchClient } from "../../apps/backend/dist/modules/contactResearchClient.js";
import { startPersonResearchServer } from "../../apps/agent-host/dist/personResearchServer.js";
import { browseDiscoveredPublicPage } from "../../apps/agent-host/dist/isolatedPublicBrowser.js";
const [databaseURL, imageID, outputPath] = process.argv.slice(2);
const database = new URL(databaseURL); assert(database.hostname === "127.0.0.1" && database.pathname === "/get9_eval");
assert(/^sha256:[a-f0-9]{64}$/.test(imageID ?? "") && outputPath);
const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url)), { Pool } = require("pg");
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: "https://api.hao.ai/anthropic", TALENT_SIGNAL_AGENT_MODEL: "anthropic/claude-sonnet-5" });
const bytes = await readFile(new URL("./fixtures/get9-research.png", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const objective = "保存这段合成聊天。请搜索陈夏的公开资料，并实际用浏览器打开搜索得到的网页核对内容；不要把示例站点或同名页面当作其职业证据。最后简短说明核对结果，不发消息或修改已确认事实。";
const report = { evaluation: "get9-browser-product.v1", createdAt: new Date().toISOString(), dataClass: "synthetic", imageID,
  scope: "Real HTTP/product task, Claude Agent SDK, Unix-socket research client/server, Chromium container, public HTTPS example.com and PostgreSQL readback. Search discovery is a controlled Exa-shaped fixture; no Exa network acceptance or installed-client acceptance is claimed.",
  objective, tools: [], searches: [], browserLifecycle: [], status: "running", releaseReady: false,
  qualityReview: { status: "pending_independent_review", rubric: "get9-quality-v1", scale: [0, 1, 2, 3, 4], minimumEachDimension: 3 } };
const pool = new Pool({ connectionString: databaseURL, max: 4, idleTimeoutMillis: 0 });
const directory = await mkdtemp("/tmp/get9-browser-product-");
let app, researchServer, completion;
const model = new ClaudeContactAgentModel(configuration, async (config, request, signal) => {
  let finish; completion = new Promise(resolve => { finish = resolve; });
  report.originalImageHash = request.images?.[0]?.contentHash;
  try {
    const result = await runClaudeHarness(config, { ...request, tools: request.tools.map(tool => ({ ...tool,
      execute: async (...input) => { const result = await tool.execute(...input); report.tools.push({ name: tool.name, input: input[0], result }); return result; },
    })) }, signal, undefined, null);
    report.sdk = result; return result;
  } catch (error) { report.sdkFailure = { code: error.message, receipt: error.receipt }; throw error; }
  finally { finish(); }
});
try {
  const page = { url: "https://example.com/", title: "Example Domain", text: "A generic example domain; this search result does not establish anyone's identity or employment.",
    publishedAt: null, retrievedAt: new Date().toISOString(), contentHash: hash("controlled discovery snippet"), providerID: "exa", providerRequestID: "controlled-discovery-no-vendor-call" };
  const search = async query => { report.searches.push(query); return [page]; };
  researchServer = await startPersonResearchServer({ socketPath: join(directory, "research.sock"),
    environment: { ...process.env, TALENT_SIGNAL_BROWSER_IMAGE: imageID },
    contactResearch: { browse: (url, signal, environment) => browseDiscoveredPublicPage(url, signal, environment, undefined, event => report.browserLifecycle.push(event)), exa: { searchWeb: search, searchProfiles: search, fetchContent: async () => page } } });
  app = await buildApp({ pool, config: { databaseUrl: databaseURL, host: "127.0.0.1", port: 0, allowedOrigins: [],
    appleSignInAudiences: [], appleSignInEnabled: false, passwordAuthEnabled: false, passwordRegistrationEnabled: false,
    simulatedAuthEnabled: true, internalLabEnabled: false, retentionSweepIntervalMs: 3_600_000, sessionTtlSeconds: 3600,
    chatMediaStorage: { provider: "local", directory: join(directory, "media") } },
    remoteChatProvider: null, personResearchProvider: null, screenshotContact: { model, research: new LocalContactResearchClient(join(directory, "research.sock")) },
    labJobWorkerEnabled: false, labCIVerifier: null });
  const account = randomUUID(), user = randomUUID(), slug = `browser-product-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic browser product evaluation')", [account, slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'browser@synthetic.local','Synthetic owner','simulated_human')", [user, account]);
  const base = await app.listen({ host: "127.0.0.1", port: 0 }), client = new TalentSignalClient(base);
  const login = await client.login({ account_slug: slug, user_email: "browser@synthetic.local", client_label: "get9-browser-product" });
  const request = async (path, body) => {
    const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${login.access_token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert(response.ok, `Product HTTP ${response.status}`); return response.json();
  };
  const started = Date.now();
  let task = await request("/v1/contact-agent/tasks", { idempotency_key: randomUUID(), objective, allow_public_research: true,
    image: { media_type: "image/png", byte_size: bytes.length, content_hash: hash(bytes), data_base64: bytes.toString("base64") }, captured_at: new Date().toISOString() });
  report.taskID = task.task_id;
  while (task.status === "running" && Date.now() - started < 330_000) { await delay(1_000); task = await request(`/v1/contact-agent/tasks/${task.task_id}`); }
  await completion;
  for (let i = 0; i < 100; i++) {
    const saved = await pool.query("SELECT jsonb_array_length(state->'model_receipts') AS count FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2", [account, task.task_id]);
    if (Number(saved.rows[0]?.count) > 0) break;
    await delay(100);
  }
  task = await request(`/v1/contact-agent/tasks/${task.task_id}`);
  report.output = task; report.durationMs = Date.now() - started;
  const rendered = task.public_sources.find(source => source.provider_id === "browser");
  const confirmed = await pool.query("SELECT count(*) FROM confirmed_states WHERE account_id=$1", [account]);
  report.checks = { sdkCompleted: Boolean(report.sdk), modelMatched: report.sdk?.reportedModels?.[0] === "claude-sonnet-5",
    originalImageReachedSDK: report.originalImageHash === hash(bytes), filingCompleted: task.status === "completed" && Boolean(task.capture_id) && task.message_count > 0,
    browserActuallyInvoked: report.tools.some(tool => tool.name === "browse_contact_source" && !tool.result.isError),
    realBrowserSourceSaved: rendered?.browser_observation?.engine === "chromium", realHTTPSRequests: rendered?.browser_observation?.http_requests > 0,
    exactRenderedPage: rendered?.text.includes("documentation examples") === true, renderedHashMatches: rendered?.content_hash === hash(rendered?.text ?? ""),
    noProfileInferredFromExamplePage: task.profile_fields.length === 0,
    noConfirmedStateCreated: Number(confirmed.rows[0].count) === 0, noExternalEffects: task.external_effects.length === 0 };
  report.status = Object.values(report.checks).every(Boolean) ? "passed" : "failed";
} catch (error) { report.status = "failed"; report.error = error.message; }
finally {
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  await app?.close(); await pool.end();
  if (researchServer) await new Promise(resolve => researchServer.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error }));
if (report.status !== "passed") process.exitCode = 1;
