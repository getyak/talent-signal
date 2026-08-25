import { createServer } from "node:http";

import {
  prepareIOSPursuitProposalFixture,
  retireIOSPursuitProposalFixture,
  type IOSPursuitProposalFixture,
} from "./prepareIOSPursuitProposalFixture.js";

const upstreamBaseUrl =
  process.env.API_BASE_URL ?? "http://127.0.0.1:4320";
const port = Number(process.env.IOS_PURSUIT_FIXTURE_PORT ?? "4323");
let preparation = Promise.resolve();
let activeFixture: IOSPursuitProposalFixture | undefined;

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health/live") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ status: "ok", backend_url: upstreamBaseUrl }),
    );
    return;
  }
  if (
    request.method !== "POST" ||
    request.url !== "/__ios_pursuit_proposal_fixture/prepare"
  ) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }

  preparation = preparation.then(async () => {
    try {
      if (activeFixture) {
        await retireIOSPursuitProposalFixture(activeFixture, upstreamBaseUrl);
      }
      const fixture = await prepareIOSPursuitProposalFixture(upstreamBaseUrl);
      activeFixture = fixture;
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(fixture));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: "IOS_PURSUIT_FIXTURE_FAILURE",
          message: error instanceof Error ? error.message : "Unknown fixture error",
        }),
      );
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `${JSON.stringify({ event: "ios_pursuit_fixture_server_ready", port, upstream: upstreamBaseUrl })}\n`,
  );
});

function close(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
