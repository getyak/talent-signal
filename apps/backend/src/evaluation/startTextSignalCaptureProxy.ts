import { createServer } from "node:http";

const upstreamBaseUrl =
  process.env.UPSTREAM_BASE_URL ?? "http://127.0.0.1:4320";
const port = Number(process.env.TEXT_SIGNAL_PROXY_PORT ?? "4322");

let resourceCapturePostCount = 0;
let pursuitProposalPostCount = 0;
let deletionPostCount = 0;
let blockedRequestCount = 0;
let offline = false;

function countWrite(method: string | undefined, path: string): void {
  if (method !== "POST") return;
  if (path === "/v1/resource-captures") resourceCapturePostCount += 1;
  if (/^\/v1\/pursuits\/[0-9a-f-]+\/proposals$/.test(path)) {
    pursuitProposalPostCount += 1;
  }
  if (/^\/v1\/captures\/[0-9a-f-]+\/deletion$/.test(path)) {
    deletionPostCount += 1;
  }
}

const server = createServer(async (request, response) => {
  const path = request.url ?? "/";
  if (path === "/__text_signal_proxy/state") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        resource_capture_post_count: resourceCapturePostCount,
        pursuit_proposal_post_count: pursuitProposalPostCount,
        deletion_post_count: deletionPostCount,
        blocked_request_count: blockedRequestCount,
        offline,
      }),
    );
    return;
  }
  if (request.method === "POST" && path === "/__text_signal_proxy/offline") {
    offline = true;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ offline }));
    return;
  }
  if (request.method === "POST" && path === "/__text_signal_proxy/online") {
    offline = false;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ offline }));
    return;
  }
  if (offline) {
    blockedRequestCount += 1;
    response.writeHead(503, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: {
          code: "SYNTHETIC_OFFLINE",
          message: "The deterministic Text Signal proxy is offline.",
        },
      }),
    );
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (
        value === undefined ||
        ["host", "content-length", "connection"].includes(name.toLowerCase())
      ) {
        continue;
      }
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }

    countWrite(request.method, path);
    const upstreamRequest: RequestInit = {
      method: request.method ?? "GET",
      headers,
    };
    if (body.length > 0) upstreamRequest.body = new Uint8Array(body);
    const upstreamResponse = await fetch(
      new URL(path, upstreamBaseUrl),
      upstreamRequest,
    );
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of upstreamResponse.headers.entries()) {
      if (
        ["content-length", "content-encoding", "transfer-encoding", "connection"].includes(
          name.toLowerCase(),
        )
      ) {
        continue;
      }
      responseHeaders[name] = value;
    }
    response.writeHead(upstreamResponse.status, responseHeaders);
    response.end(responseBody);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: "TEXT_SIGNAL_PROXY_FAILURE",
        message: error instanceof Error ? error.message : "Unknown proxy error",
      }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `${JSON.stringify({ event: "text_signal_proxy_ready", port, upstream: upstreamBaseUrl })}\n`,
  );
});

function close(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
