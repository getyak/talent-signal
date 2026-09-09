// Production HTTP probe with synthetic identity and a loopback-only backend.
// Run after `pnpm build`: node apps/web/scripts/measure-loading.mjs [--assert]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { encode } from "next-auth/jwt";

const secret = "get25-synthetic-performance-secret";
const cookieName = "talent-signal.session-v2";
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const calls = [];
let revision = 1;
const backend = createServer(async (req, res) => {
  calls.push(req.url);
  const account = req.headers.authorization === "Bearer synthetic-b" ? "b" : "a";
  res.setHeader("content-type", "application/json");
  if (req.url === "/v1/lab") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res.end(JSON.stringify({ capability: { enabled: false }, active_session: null, latest_run: null }));
  } else if (req.url === "/v1/auth/session") {
    res.end(JSON.stringify({ account: { id: account } }));
  } else if (req.url?.startsWith("/v1/people")) {
    res.end(JSON.stringify({ people: [{
      id: `synthetic-${account}`, display_label: `GET25-${account}-revision-${revision}`,
      contexts: [], context_count: 0, capture_count: 0, confirmed_identity_count: 0,
      identity_matches: [], last_activity_at: null, avatar: null, profile: null,
    }] }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: "fixture_not_found" } }));
  }
});

await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
// Ask the OS for a free Web port, then release it immediately before Next starts.
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: webRoot,
  env: { ...process.env, AUTH_SECRET: secret, AUTH_TRUST_HOST: "true", TALENT_SIGNAL_INTEGRATION_MODE: "true", TALENT_SIGNAL_BACKEND_URL: `http://127.0.0.1:${backend.address().port}`, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
// Subscribe before startup can fail; waiting for a second exit in cleanup hangs.
const exited = once(server, "exit");
const base = `http://127.0.0.1:${port}`;

async function cookie(account = "a", expired = false) {
  return `${cookieName}=${await encode({ secret, salt: cookieName, token: {
    sub: `synthetic-${account}`, name: `GET25 account ${account}`,
    backendAccessToken: `synthetic-${account}`, backendAccountId: account,
    backendAccountName: `GET25 ${account}`, backendAccountSlug: `fixture-${account}`,
    backendExpiresAt: new Date(Date.now() + (expired ? -60000 : 3600000)).toISOString(),
    backendRole: "member", backendUserId: `synthetic-${account}`, backendUsername: null,
  } })}`;
}

async function page(account = "a") {
  calls.length = 0;
  const started = performance.now();
  const response = await fetch(`${base}/workspace/people`, { headers: { cookie: await cookie(account) } });
  const ttfb = performance.now() - started;
  const html = await response.text();
  return { html, ttfbMs: Math.round(ttfb), completeMs: Math.round(performance.now() - started), calls: [...calls], cacheControl: response.headers.get("cache-control") };
}

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Next startup timed out")), 60000);
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Next exited ${code}`)); });
    server.stdout.on("data", (data) => { if (data.toString().includes("Ready")) { clearTimeout(timeout); resolve(); } });
    server.stderr.on("data", (data) => process.stderr.write(data));
  });
  const first = await page();
  assert.match(first.html, /GET25-a-revision-1/);
  const scripts = [...new Set([...first.html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((match) => match[1]))];
  let jsBytes = 0;
  let jsGzipBytes = 0;
  for (const path of scripts) {
    const bytes = await readFile(`${webRoot}.next${path.replace(/^\/_next/, "")}`);
    jsBytes += bytes.length;
    jsGzipBytes += gzipSync(bytes).length;
  }
  const staticResponse = await fetch(`${base}${scripts[0]}`);
  const samples = [first];
  for (let i = 0; i < 2; i++) samples.push(await page());
  revision = 2;
  const fresh = await page();
  assert.match(fresh.html, /GET25-a-revision-2/);
  assert.doesNotMatch(fresh.html, /GET25-a-revision-1/);
  const other = await page("b");
  assert.match(other.html, /GET25-b-revision-2/);
  assert.doesNotMatch(other.html, /GET25-a-revision-2/);
  for (const headers of [{}, { cookie: await cookie("a", true) }]) {
    const response = await fetch(`${base}/workspace/people`, { headers, redirect: "manual" });
    const body = await response.text();
    assert.doesNotMatch(body, /GET25-[ab]-revision/);
    assert.ok(response.headers.get("location")?.includes("/login") || /<meta[^>]+http-equiv="refresh"[^>]+url=\/login/.test(body) || (headers.cookie && body.includes("重新登录") && body.includes("backend_session_expired")), `Expected login redirect: ${response.status} ${body.slice(-2500)}`);
  }
  assert.match(first.cacheControl, /private/);
  assert.match(first.cacheControl, /no-store/);
  assert.match(staticResponse.headers.get("cache-control"), /immutable/);
  if (process.argv.includes("--assert")) {
    for (const sample of samples) assert.ok(!sample.calls.includes("/v1/lab"), "Product SSR must not wait for Lab");
  }
  console.log(JSON.stringify({
    fixture: "synthetic-loopback-only", labDelayMs: 2000,
    samples: samples.map(({ html, ...metrics }) => ({ ...metrics, htmlBytes: Buffer.byteLength(html) })),
    initialJs: { files: scripts.length, bytes: jsBytes, gzipBytes: jsGzipBytes },
    staticCacheControl: staticResponse.headers.get("cache-control"),
    freshRead: true, accountIsolation: true, unauthenticatedRedirectAndExpiredRecovery: true,
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await exited;
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
