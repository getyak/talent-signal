import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { browseDiscoveredPublicPage as runBrowser } from "../../apps/agent-host/dist/isolatedPublicBrowser.js";
const [image, output] = process.argv.slice(2);
assert(/^sha256:[a-f0-9]{64}$/.test(image ?? "") && output);
const environment = { ...process.env, TALENT_SIGNAL_BROWSER_IMAGE: image };
const resource = body => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from(body) });
const report = { evaluation: "get9-browser-recovery.v1", createdAt: new Date().toISOString(), image,
  scope: "Actual Chromium containers with synthetic broker pages. Runaway page JavaScript, resource flood and subsequent admission after verified cleanup; no SDK or installed-client claim.",
  cases: [], status: "running", releaseReady: false };
let lifecycle = [];
const browseDiscoveredPublicPage = (...args) => runBrowser(...args, event => lifecycle.push(event));
async function check(name, operation) {
  lifecycle = [];
  const start = Date.now();
  try { report.cases.push({ name, status: "passed", detail: await operation(), durationMs: Date.now() - start }); }
  catch (error) { report.cases.push({ name, status: "failed", error: error.message, durationMs: Date.now() - start }); }
  report.cases.at(-1).lifecycle = lifecycle;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
for (const [name, html, allowedFailure] of [
  ["runaway-page-terminates", '<h1>Before runaway script</h1><script>setTimeout(()=>{while(true){}},0)</script>', /^BROWSER_(EXECUTION|NAVIGATION|RENDER)_FAILED$/],
  ["resource-flood-rejects-incomplete-receipt", '<h1>Resource flood</h1><script>for(let i=0;i<60;i++)fetch("/item-"+i).catch(()=>{})</script>', /^BROWSER_(RESULT_INVALID|REQUEST_LIMIT)$/],
]) {
  await check(name, async () => {
    let dispatched = 0, failure;
    try {
      await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(40_000), environment,
        async url => { dispatched++; return resource(url.endsWith("/fixture") ? html : "<p>Resource</p>"); });
    } catch (error) { failure = error.message; }
    assert.match(failure ?? "UNEXPECTED_SUCCESS", allowedFailure);
    assert(dispatched > 0 && dispatched <= 40);
    return { dispatched, failure };
  });
  await check(`fresh-run-after-${name}`, async () => {
    const result = await browseDiscoveredPublicPage("https://example.com/fixture", AbortSignal.timeout(35_000), environment,
      async () => resource("<h1>Recovered with a fresh browser</h1>"));
    assert.equal(result.text, "Recovered with a fresh browser");
    assert.equal(result.requests, 1); assert.equal(result.blockedRequests, 0);
    return result;
  });
}
report.status = report.cases.every(item => item.status === "passed") ? "passed" : "failed";
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ name, status }) => ({ name, status })) }));
if (report.status !== "passed") process.exitCode = 1;
