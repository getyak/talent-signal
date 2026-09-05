import { createServer } from "node:http";
import { CONTRACT_VERSION } from "@talent-signal/contracts";

// Loopback-only synthetic UI fixture. It has no database, provider, or sign-in implementation.
// The log records closed route metadata and credential presence, never request bodies or values.
for (const [port, deployment] of [[4331, "fixture-a"], [4332, "fixture-b"], [4333, "wrong-identity"]] as const) {
  createServer((request, response) => {
    const path = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
    console.log(JSON.stringify({ port, method: request.method, path,
      has_authorization: Boolean(request.headers.authorization), has_cookie: Boolean(request.headers.cookie) }));
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");
    if (request.method === "GET" && path === "/v1/runtime/manifest") {
      response.end(JSON.stringify({ service: "talent-signal", contract_version: CONTRACT_VERSION,
        deployment_id: deployment, revision: "synthetic-ui-fixture", data_domain: "synthetic-only",
        internal_lab_enabled: true, authentication: { apple: false, password: false, simulated: false } }));
    } else if (request.method === "GET" && path === "/health/ready") {
      response.end(JSON.stringify({ status: "fixture-ready" }));
    } else if (request.method === "POST" && path === "/v1/auth/apple/challenges") {
      response.end(JSON.stringify({ contract_version: CONTRACT_VERSION, challenge_id: "fixture-challenge",
        nonce: "synthetic-nonce", expires_at: new Date(Date.now() + 60_000).toISOString() }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: "FIXTURE_ONLY", message: "No account or business writes exist in this fixture." } }));
    }
  }).listen(port, "127.0.0.1", () => console.log(JSON.stringify({ listening: port, fixture: true })));
}
