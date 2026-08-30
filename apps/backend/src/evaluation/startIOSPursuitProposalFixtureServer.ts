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
let closing = false;

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

async function close(): Promise<void> {
  if (closing) return;
  closing = true;

  const stopped = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  try {
    await stopped;
    await preparation;
    if (activeFixture) {
      await retireIOSPursuitProposalFixture(activeFixture, upstreamBaseUrl);
      activeFixture = undefined;
    }
  } catch (error) {
    process.stderr.write(
      `iOS Proposal fixture shutdown failed: ${error instanceof Error ? error.stack ?? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
