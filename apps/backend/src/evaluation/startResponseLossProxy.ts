import { createServer } from "node:http";
import { createHash } from "node:crypto";

const upstreamBaseUrl =
  process.env.UPSTREAM_BASE_URL ?? "http://127.0.0.1:4320";
const port = Number(process.env.RESPONSE_LOSS_PROXY_PORT ?? "4321");
let reviewPostCount = 0;
let droppedResponseCount = 0;
let actionCompletionPostCount = 0;
let droppedActionResponseCount = 0;
let resourceCapturePostCount = 0;
let droppedResourceCaptureResponseCount = 0;
const proposalReviewPathsWithDroppedResponse = new Set<string>();
const actionCompletionPathsWithDroppedResponse = new Set<string>();
let hasDroppedResourceCaptureResponse = false;
const resourceCaptureRequestHashes: string[] = [];
let firstResourceCaptureRequest: unknown;
let resourceCaptureRequestDifferencePaths: string[] = [];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function digestJSON(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function differingJSONPaths(
  left: unknown,
  right: unknown,
  path = "$",
): string[] {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    const differences: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      differences.push(
        ...differingJSONPaths(left[index], right[index], `${path}[${index}]`),
      );
    }
    return differences;
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    return [...keys].flatMap((key) =>
      differingJSONPaths(leftRecord[key], rightRecord[key], `${path}.${key}`),
    );
  }
  return [path];
}

function isReviewRequest(method: string | undefined, path: string): boolean {
  return (
    method === "POST" &&
    /^\/v1\/pursuit-proposals\/[0-9a-f-]+\/reviews$/.test(path)
  );
}

function isActionCompletionRequest(
  method: string | undefined,
  path: string,
): boolean {
  return (
    method === "POST" &&
    /^\/v1\/pursuits\/[0-9a-f-]+\/actions\/[0-9a-f-]+\/completions$/.test(
      path,
    )
  );
}

function isResourceCaptureRequest(
  method: string | undefined,
  path: string,
): boolean {
  return method === "POST" && path === "/v1/resource-captures";
}

const server = createServer(async (request, response) => {
  const path = request.url ?? "/";
  if (path === "/__response_loss_proxy/state") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        review_post_count: reviewPostCount,
        dropped_response_count: droppedResponseCount,
        action_completion_post_count: actionCompletionPostCount,
        dropped_action_response_count: droppedActionResponseCount,
        resource_capture_post_count: resourceCapturePostCount,
        dropped_resource_capture_response_count:
          droppedResourceCaptureResponseCount,
        resource_capture_request_hashes: resourceCaptureRequestHashes,
        resource_capture_request_difference_paths:
          resourceCaptureRequestDifferencePaths,
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

    const reviewRequest = isReviewRequest(request.method, path);
    const actionCompletionRequest = isActionCompletionRequest(
      request.method,
      path,
    );
    if (reviewRequest) reviewPostCount += 1;
    if (actionCompletionRequest) actionCompletionPostCount += 1;
    const resourceCaptureRequest = isResourceCaptureRequest(
      request.method,
      path,
    );
    if (resourceCaptureRequest) resourceCapturePostCount += 1;
    if (resourceCaptureRequest) {
      const parsedRequest = JSON.parse(body.toString("utf8")) as unknown;
      resourceCaptureRequestHashes.push(digestJSON(parsedRequest));
      if (firstResourceCaptureRequest === undefined) {
        firstResourceCaptureRequest = parsedRequest;
      } else {
        resourceCaptureRequestDifferencePaths = differingJSONPaths(
          firstResourceCaptureRequest,
          parsedRequest,
        );
      }
    }
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

    if (reviewRequest && !proposalReviewPathsWithDroppedResponse.has(path)) {
      proposalReviewPathsWithDroppedResponse.add(path);
      droppedResponseCount += 1;
      process.stdout.write(
        `${JSON.stringify({ event: "review_response_dropped_after_upstream_commit", review_post_count: reviewPostCount })}\n`,
      );
      response.destroy();
      return;
    }
    if (
      actionCompletionRequest &&
      !actionCompletionPathsWithDroppedResponse.has(path)
    ) {
      actionCompletionPathsWithDroppedResponse.add(path);
      droppedActionResponseCount += 1;
      process.stdout.write(
        `${JSON.stringify({ event: "action_completion_response_dropped_after_upstream_commit", action_completion_post_count: actionCompletionPostCount })}\n`,
      );
      response.destroy();
      return;
    }
    if (resourceCaptureRequest && !hasDroppedResourceCaptureResponse) {
      hasDroppedResourceCaptureResponse = true;
      droppedResourceCaptureResponseCount += 1;
      process.stdout.write(
        `${JSON.stringify({ event: "resource_capture_response_dropped_after_upstream_commit", resource_capture_post_count: resourceCapturePostCount })}\n`,
      );
      response.destroy();
      return;
    }

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
    if (response.destroyed) return;
    response.writeHead(502, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: "RESPONSE_LOSS_PROXY_FAILURE",
        message: error instanceof Error ? error.message : "Unknown proxy error",
      }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `${JSON.stringify({ event: "response_loss_proxy_ready", port, upstream: upstreamBaseUrl })}\n`,
  );
});

function close(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
