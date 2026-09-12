import { beforeEach, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  createWebTelemetryTrace: vi.fn(),
  appendWebTelemetryBatch: vi.fn(),
  completeWebTelemetryTrace: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "synthetic" } }) }));
vi.mock("@/lib/server/telemetryBackend", () => backend);

import { POST as create } from "./route";
import { POST as append } from "./[traceId]/batch/route";
import { POST as complete } from "./[traceId]/completion/route";

beforeEach(() => vi.clearAllMocks());

it.each([create, append, complete])("rejects old unbound telemetry callers before reading or retaining private content", async route => {
  const request = new Request("https://example.test/api/telemetry/traces", {
    method: "POST",
    headers: { host: "example.test", origin: "https://example.test" },
    body: '{"content_parts":[{"content_text":"Synthetic private evidence"}]}',
  });
  const readBody = vi.spyOn(request, "json");
  const response = await route(request, { params: Promise.resolve({ traceId: "a".repeat(32) }) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "backend_session_expired" });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(readBody).not.toHaveBeenCalled();
  for (const operation of Object.values(backend)) expect(operation).not.toHaveBeenCalled();
});
