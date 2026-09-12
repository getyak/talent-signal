import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects unbound workspace %s before consuming private data", async method => {
  const request = new NextRequest("https://example.test/api/local-integration/captures", {
    method, body: '{"receipt":"previously-issued","draft":"synthetic private evidence"}',
  });
  const read = vi.spyOn(request, "json");
  const response = proxy(request);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "backend_session_expired" });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(read).not.toHaveBeenCalled();
  expect(request.bodyUsed).toBe(false);
});

it.each(["/api/telemetry/traces", "/api/local-integration/voice-transcriptions", "/api/workspace-chat", "/api/contact-agent/tasks", "/api/product-runs", "/api/lab", "/api/auth-other", "/api/analyze-private"])("requires scope for %s, including future workspace APIs", path => {
  const request = new NextRequest(`https://example.test${path}`, { method: "POST" });
  expect(proxy(request).status).toBe(401);
  request.headers.set("x-talent-signal-workspace", "rendered-account");
  expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
});

it.each(["/api/auth/callback/google", "/api/auth/signout", "/api/analyze", "/api/browser-extension/captures", "/api/dev/agent-stream"])("preserves the existing separate admission boundary for %s", path => {
  expect(proxy(new NextRequest(`https://example.test${path}`, { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
});

it.each(["GET", "HEAD"])("rejects old unbound private %s requests before current-account reads", method => {
  expect(config.matcher).toBe("/api/:path*");
  for (const path of ["/api/contact-agent/tasks", "/api/contact-agent/tasks/11111111-1111-4111-8111-111111111111"]) {
    const request = new NextRequest(`https://example.test${path}`, { method });
    expect(proxy(request).status).toBe(401);
    request.headers.set("x-talent-signal-workspace", "rendered-account");
    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  }
});

it("preserves extension task readback and keyed recovery with a route-verified session", () => {
  const headers = { "x-contact-handoff-session": "synthetic-fingerprint-checked-by-route" };
  for (const path of ["/api/contact-agent/tasks/11111111-1111-4111-8111-111111111111", "/api/contact-agent/tasks?handoff_request_id=request-key"]) {
    expect(proxy(new NextRequest(`https://example.test${path}`, { headers })).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest(`https://example.test${path}`)).status).toBe(401);
  }
  for (const path of ["/api/contact-agent/tasks", "/api/contact-agent/tasks?handoff_request_id="]) {
    expect(proxy(new NextRequest(`https://example.test${path}`, { headers })).status).toBe(401);
  }
});

it.each(["/api/contact-agent/tasks/11111111-1111-4111-8111-111111111111/images/0", "/api/product-runs/run/screenshot", "/api/pursuit-agent-tasks/task/stream", "/api/chat-artifacts/task"])("preserves native resource and stream route authority for %s", path => {
  expect(proxy(new NextRequest(`https://example.test${path}`)).headers.get("x-middleware-next")).toBe("1");
});

it("preserves only the exact session-bound extension handoff transport", () => {
  const headers = { "x-contact-handoff-session": "synthetic-fingerprint-checked-by-route" };
  expect(proxy(new NextRequest("https://example.test/api/contact-agent/tasks", { method: "POST", headers })).headers.get("x-middleware-next")).toBe("1");
  expect(proxy(new NextRequest("https://example.test/api/contact-agent/tasks", { method: "DELETE", headers })).status).toBe(401);
  expect(proxy(new NextRequest("https://example.test/api/contact-agent/tasks/other", { method: "POST", headers })).status).toBe(401);
  expect(proxy(new NextRequest("https://example.test/api/contact-agent/tasks", { method: "POST", headers: { "x-contact-handoff-session": " " } })).status).toBe(401);
});
