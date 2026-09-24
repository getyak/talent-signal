// Disposable experiment only; never attach this to a product server.
// Compare /baseline and /safe while the incoming HTTP socket is active.
// Reports themselves (including stacks and environment) are never emitted.
import { createServer } from "node:http";

Object.assign(process.report, { excludeEnv: true });
const host = process.env.PROBE_HOST ?? "127.0.0.1";
const port = Number(process.env.PROBE_PORT ?? 55452);
const server = createServer((request, response) => {
  if (!["/baseline", "/safe"].includes(request.url)) {
    response.writeHead(404).end();
    return;
  }
  Object.assign(process.report, { excludeNetwork: request.url === "/safe" });
  const started = performance.now();
  const report = process.report.getReport();
  const result = {
    excludeNetwork: process.report.excludeNetwork,
    duration_ms: performance.now() - started,
    glibc_version_available: Boolean(report.header.glibcVersionRuntime),
  };
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(result));
});
server.listen(port, host, () => console.log("Diagnostic probe ready"));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}
