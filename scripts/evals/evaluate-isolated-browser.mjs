import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { browseDiscoveredPublicPage as runBrowser } from "../../apps/agent-host/dist/isolatedPublicBrowser.js";
import { fetchBrowserResource } from "../../apps/agent-host/dist/safeWebFetch.js";
const [image, output] = process.argv.slice(2);
assert(/^sha256:[a-f0-9]{64}$/.test(image ?? "") && output);
const environment = { ...process.env, TALENT_SIGNAL_BROWSER_IMAGE: image };
const report = { evaluation: "get9-isolated-browser-boundaries.v1", createdAt: new Date().toISOString(),
  image, scope: "Actual Chromium containers and synthetic broker pages; separate live public HTTPS page. No SDK/product or installed-client acceptance.",
  cases: [], status: "running", releaseReady: false };
const resource = (body, type = "text/html") => ({ status: 200, headers: { "content-type": type }, body: Buffer.from(body) });
let lifecycle = [];
const browseDiscoveredPublicPage = (...args) => runBrowser(...args, event => lifecycle.push(event));
async function check(name, operation) {
  lifecycle = [];
  const start = Date.now();
  try { const detail = await operation(); report.cases.push({ name, status: "passed", durationMs: Date.now() - start, detail }); }
  catch (error) { report.cases.push({ name, status: "failed", durationMs: Date.now() - start, error: error.message, diagnostic: error.cause, detail: error.detail }); }
  report.cases.at(-1).lifecycle = lifecycle;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
await check("javascript-and-brokered-resource", async () => {
  const requests = [];
  const result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment, async url => {
    requests.push(url);
    if (url.endsWith("/data.json")) return resource('{"hours":17}', "application/json");
    return resource('<title>Owned synthetic page</title><h1 id="result">Loading</h1><script>fetch("/data.json").then(r=>r.json()).then(d=>document.getElementById("result").textContent="Rendered total "+d.hours+"; Node "+typeof process);localStorage.setItem("runMarker","first")</script>');
  });
  assert.equal(result.text, "Rendered total 17; Node undefined"); assert.equal(result.engine, "chromium");
  assert.equal(requests.length, 2); return { result, requests };
});
await check("fresh-profile-no-prior-local-storage", async () => {
  const result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment,
    async () => resource('<h1 id="r"></h1><script>document.getElementById("r").textContent="Previous: "+localStorage.getItem("runMarker")+"; Cookies: "+document.cookie</script>'));
  assert.equal(result.text, "Previous: null; Cookies:"); return result;
});
await check("cross-origin-private-post-and-websocket-denied", async () => {
  const requests = [];
  let result;
  try { result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment, async url => {
    requests.push(url); return resource('<h1>Public page remains readable</h1><script>fetch("https://other.example/leak").catch(()=>{});fetch("https://127.0.0.1/secret").catch(()=>{});fetch("/write",{method:"POST",body:"synthetic"}).catch(()=>{});new WebSocket("wss://example.com/socket")</script>');
  }); } catch (error) { error.detail = { requests }; throw error; }
  assert.deepEqual(requests, ["https://example.com/fixture"]); assert.equal(result.blockedRequests, 4);
  return { result, requests };
});
await check("redirect-remains-source-bound", async () => {
  const requests = [];
  let result;
  try { result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment, async url => {
    requests.push(url);
    return url.endsWith("/fixture") ? { status: 302, headers: { location: "https://example.com/final" }, body: Buffer.alloc(0) }
      : resource("<h1>Final public page</h1>");
  }); } catch (error) { error.detail = { requests }; throw error; }
  assert.equal(result.url, "https://example.com/final"); assert.equal(requests.length, 2); return result;
});
await check("cancel-during-resource-fetch", async () => {
  const controller = new AbortController(); let dispatched = false;
  await assert.rejects(browseDiscoveredPublicPage("https://example.com/fixture", controller.signal, environment, async (_url, _origin, signal) => {
    dispatched = true; setTimeout(() => controller.abort(new Error("SYNTHETIC_CANCEL")), 100);
    await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    throw new Error("UNREACHABLE");
  }), /SYNTHETIC_CANCEL/);
  assert(dispatched); return { dispatched, canceled: true };
});
await check("late-resource-cancellation-is-in-final-receipt", async () => {
  let canceled = false;
  const result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment,
    async (url, _origin, signal) => {
      if (!url.endsWith("/slow")) return resource('<h1>Visible snapshot</h1><script>fetch("/slow").catch(()=>{})</script>');
      await new Promise((_, reject) => signal.addEventListener("abort", () => { canceled = true; reject(signal.reason); }, { once: true }));
      throw new Error("UNREACHABLE");
    });
  assert(canceled); assert.equal(result.requests, 2); assert.equal(result.blockedRequests, 1);
  return { result, canceled };
});
await check("async-diagnostic-failure-does-not-change-run", async () => {
  const result = await runBrowser("https://example.com/fixture", AbortSignal.timeout(35_000), environment,
    async () => resource("<h1>Diagnostics remain observational</h1>"),
    async event => { lifecycle.push(event); await Promise.resolve(); throw new Error("SYNTHETIC_DIAGNOSTIC_FAILURE"); });
  assert.equal(result.text, "Diagnostics remain observational"); return result;
});
await check("live-public-https-page", async () => {
  const requests = [];
  let result;
  try { result = await browseDiscoveredPublicPage("https://example.com/", AbortSignal.timeout(35_000), environment, async (url, origin, signal, options) => {
    try { const response = await fetchBrowserResource(url, origin, signal, options); requests.push({ url, status: response.status, bytes: response.body.length }); return response; }
    catch (error) { requests.push({ url, error: error.message }); throw error; }
  }); } catch (error) { error.detail = { requests }; throw error; }
  assert.equal(result.title, "Example Domain"); assert.match(result.text, /documentation examples/);
  return { result, requests };
});
report.status = report.cases.every(item => item.status === "passed") ? "passed" : "failed";
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ name, status }) => ({ name, status })) }));
if (report.status !== "passed") process.exitCode = 1;
