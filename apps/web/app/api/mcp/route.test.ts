import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/server/backendAuth", () => ({
  backendAuthBaseUrl: () => "http://127.0.0.1:4317",
}));

import { GET, POST } from "./route";

const ORIGIN = "https://app.example.test";
const upstream = vi.fn();

function request(options: {
  body?: string;
  headers?: Record<string, string>;
  method: "GET" | "POST";
}) {
  return new NextRequest(`${ORIGIN}/api/mcp`, {
    body: options.body,
    headers: options.headers,
    method: options.method,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", upstream);
  process.env.TALENT_SIGNAL_MCP_PUBLIC_ORIGIN = ORIGIN;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TALENT_SIGNAL_MCP_PUBLIC_ORIGIN;
});

it("returns 405 for GET because this server has no stream", async () => {
  const response = await GET();
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("POST");
  expect(upstream).not.toHaveBeenCalled();
});

it("requires its own bearer token and never reads browser cookies", async () => {
  const response = await POST(
    request({
      body: "{}",
      headers: { cookie: "talent-signal.session-v2=owner-secret", origin: ORIGIN },
      method: "POST",
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toBe("Bearer");
  expect(upstream).not.toHaveBeenCalled();
});

it("rejects an Origin that is not the configured public origin", async () => {
  const response = await POST(
    request({
      body: "{}",
      headers: { authorization: "Bearer tsmcp_token", origin: "https://hostile.invalid" },
      method: "POST",
    }),
  );
  expect(response.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("forwards only the MCP transport headers without cookies", async () => {
  upstream.mockResolvedValue(
    new Response(JSON.stringify({ id: 1, jsonrpc: "2.0", result: {} }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
  const response = await POST(
    request({
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "ping" }),
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer tsmcp_token",
        "content-type": "application/json",
        cookie: "talent-signal.session-v2=owner-secret",
        "mcp-protocol-version": "2025-11-25",
        origin: ORIGIN,
      },
      method: "POST",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ result: {} });
  const [, init] = upstream.mock.calls[0] as [string, RequestInit];
  expect(init.headers).toEqual({
    accept: "application/json, text/event-stream",
    authorization: "Bearer tsmcp_token",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25",
    origin: ORIGIN,
  });
  expect(JSON.stringify(init.headers)).not.toContain("owner-secret");
  expect(JSON.stringify(init.headers)).not.toContain("cookie");
});

it("refuses oversized request bodies", async () => {
  const response = await POST(
    request({
      body: "x".repeat(140_000),
      headers: { authorization: "Bearer tsmcp_token", origin: ORIGIN },
      method: "POST",
    }),
  );
  expect(response.status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

it("fails closed when the deployment has no public origin", async () => {
  delete process.env.TALENT_SIGNAL_MCP_PUBLIC_ORIGIN;
  const response = await POST(
    request({
      body: "{}",
      headers: { authorization: "Bearer tsmcp_token" },
      method: "POST",
    }),
  );
  expect(response.status).toBe(503);
  expect(upstream).not.toHaveBeenCalled();
});

it("treats a malformed configured public origin as unconfigured", async () => {
  for (const value of [
    "https://app.example.test/path",
    "https://user:pass@app.example.test",
    "https://app.example.test?q=1",
    "http://app.example.test",
    "not-a-url",
  ]) {
    process.env.TALENT_SIGNAL_MCP_PUBLIC_ORIGIN = value;
    const response = await POST(
      request({
        body: "{}",
        headers: { authorization: "Bearer tsmcp_token" },
        method: "POST",
      }),
    );
    expect(response.status).toBe(503);
  }
  expect(upstream).not.toHaveBeenCalled();
});

it("answers 408 for a stalled request body instead of hanging", async () => {
  vi.useFakeTimers();
  try {
    const stalled = new ReadableStream<Uint8Array>({ start() {} });
    const fake = {
      body: stalled,
      headers: new Headers({
        authorization: "Bearer tsmcp_token",
        origin: ORIGIN,
      }),
      method: "POST",
      signal: new AbortController().signal,
    } as unknown as NextRequest;
    const pending = POST(fake);
    await vi.advanceTimersByTimeAsync(11_000);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(upstream).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
