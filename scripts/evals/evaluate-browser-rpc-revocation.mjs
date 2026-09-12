import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalContactResearchClient } from "../../apps/backend/dist/modules/contactResearchClient.js";
import { createScreenshotContactTask, loadScreenshotContactTask, ScreenshotContactTaskRunner } from "../../apps/backend/dist/modules/screenshotContactTasks.js";
import { startPersonResearchServer } from "../../apps/agent-host/dist/personResearchServer.js";

const [databaseURL, tokenFile, outputPath] = process.argv.slice(2);
const database = new URL(databaseURL);
assert(database.hostname === "127.0.0.1" && database.pathname === "/get9_eval" && outputPath);
const token = (await readFile(tokenFile, "utf8")).trim();
assert(/^[a-f0-9]{64}$/.test(token));
const require = createRequire(new URL("../../apps/backend/package.json", import.meta.url));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: databaseURL, max: 4 });
const directory = await mkdtemp("/tmp/get9-rpc-revocation-");
const report = { evaluation: "get9-browser-rpc-revocation.v1", at: new Date().toISOString(), dataClass: "synthetic",
  scope: "Deterministic model drives real product task persistence, Unix socket, production RPC client, Chromium and public HTTPS. Source authorization is revoked after the real RPC result and before the backend persistence checkpoint. This is not a real-model quality or deployed sidecar acceptance run.",
  checks: {}, status: "running" };
let server;
try {
  const account = randomUUID(), user = randomUUID(), slug = `rpc-revocation-${randomUUID()}`;
  await pool.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic RPC revocation evaluation')", [account, slug]);
  await pool.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'rpc@synthetic.local','Synthetic owner','simulated_human')", [user, account]);
  const auth = { accountId: account, accountSlug: slug, userId: user, userEmail: "rpc@synthetic.local", userKind: "simulated_human", sessionId: randomUUID() };
  const name = `RPC source ${randomUUID().slice(0, 8)}`;
  const page = { url: "https://example.com/", title: "Example Domain", text: "A generic example domain; no identity or employment evidence.",
    publishedAt: null, retrievedAt: new Date().toISOString(), contentHash: createHash("sha256").update("controlled discovery").digest("hex"), providerID: "exa", providerRequestID: "controlled-discovery" };
  const search = async () => [page];
  server = await startPersonResearchServer({ socketPath: join(directory, "research.sock"),
    environment: { NODE_ENV: "production", TALENT_SIGNAL_BROWSER_EXECUTOR_URL: "http://127.0.0.1:4319", TALENT_SIGNAL_BROWSER_EXECUTOR_TOKEN: token },
    contactResearch: { exa: { searchWeb: search, searchProfiles: search, fetchContent: async () => page } } });
  const client = new LocalContactResearchClient(join(directory, "research.sock"));
  const created = await createScreenshotContactTask(pool, auth, { idempotency_key: randomUUID(), objective: "File and verify the synthetic public source", text: `${name}\n\nworks at Example Labs.`,
    captured_at: new Date().toISOString(), allow_public_research: true, source: { kind: "page_text", title: "Synthetic source", url: "https://example.com/profile" } });
  report.taskID = created.body.task_id;
  const research = { execute: async (input, signal) => {
    const response = await client.execute(input, signal);
    if (input.input.operation === "browse") {
      report.checks.realRPCBrowserReturned = response.sources[0]?.browser_observation?.engine === "chromium";
      report.checks.realPublicHTTPS = response.sources[0]?.browser_observation?.http_requests > 0;
      report.renderedHash = response.sources[0]?.content_hash;
      report.browser = response.sources[0]?.browser_observation;
      const state = await loadScreenshotContactTask(pool, auth, report.taskID);
      assert(state.capture_id);
      const revoked = await pool.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE account_id=$1 AND capture_id=$2 RETURNING capture_id", [account, state.capture_id]);
      report.checks.sourceRevokedBeforeReturningResult = revoked.rowCount > 0;
    }
    return response;
  } };
  const model = { extract: async () => { throw new Error("UNEXPECTED_EXTRACT"); }, next: async () => { throw new Error("UNEXPECTED_NEXT"); }, run: async (input, signal) => {
    await input.recordUnderstanding([{ platform: "Web", conversation_kind: "not_chat", contact_name: name, identity_clues: [{ kind: "company", value: "Example Labs", source_excerpt: "Example Labs" }], messages: [], uncertainties: [] }], signal);
    await input.invoke("search_contacts", { query: name }, signal);
    const filed = await input.invoke("create_contact", { display_name: name }, signal);
    assert(filed.contact);
    await input.invoke("search_contact_public", { channel: "web", query: name }, signal);
    try { report.browseResult = await input.invoke("browse_contact_source", { source_id: "public1" }, signal); }
    catch (error) { report.browseError = error.code ?? error.message; }
    return { providerRequestID: randomUUID(), model: "deterministic-rpc-revocation", inputTokens: 0, outputTokens: 0 };
  } };
  await new ScreenshotContactTaskRunner(pool, { model, research }).start(auth, report.taskID);
  const final = await loadScreenshotContactTask(pool, auth, report.taskID);
  const stored = (await pool.query("SELECT status,state,input_manifest FROM screenshot_contact_tasks WHERE account_id=$1 AND id=$2", [account, report.taskID])).rows[0];
  report.finalStatus = final.status;
  report.checks.toolResultWithheldFromModel = report.browseError === "CONTACT_TASK_LEASE_LOST" && report.browseResult === undefined;
  report.checks.taskDeletedAfterRevocation = final.status === "deleted";
  report.checks.publicSourcesUnavailable = final.public_sources.length === 0;
  report.checks.persistedStateErased = Object.keys(stored.state).length === 0 && Object.keys(stored.input_manifest).length === 0;
  report.checks.renderedHashNotPersisted = !JSON.stringify(stored).includes(report.renderedHash);
  report.checks.noConfirmedState = Number((await pool.query("SELECT count(*) FROM confirmed_states WHERE account_id=$1", [account])).rows[0].count) === 0;
  report.checks.noExternalEffects = final.external_effects.length === 0;
  report.status = Object.values(report.checks).every(Boolean) ? "passed" : "failed";
} catch (error) { report.status = "failed"; report.error = error.code ?? error.message; }
finally {
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error }));
if (report.status !== "passed") process.exitCode = 1;
