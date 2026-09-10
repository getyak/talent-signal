import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserSessionVersion } from "@/lib/server/browser-capture";
import { POST } from "./route";

const { readClaims, backend } = vi.hoisted(() => ({ readClaims: vi.fn(), backend: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/backendAuth", () => ({
  readBackendSessionClaims: readClaims,
  backendAuthBaseUrl: () => "http://127.0.0.1:4317",
  authSecret: () => "synthetic-test-secret",
}));
vi.mock("@/lib/server/browser-capture", async (original) => ({
  ...await original<typeof import("@/lib/server/browser-capture")>(),
  browserBackend: backend,
  browserReceipt: () => ({ status: "received", task_id: "task-one" }),
}));
const claims = { backendAccountId: "account-a", backendUserId: "user-a", backendAccessToken: "synthetic-token", backendExpiresAt: "2099-01-01T00:00:00Z", backendAccountName: "a", backendAccountSlug: "a", backendRole: "member" as const, backendUsername: null };
function request(origin = "https://workspace.example", target = origin) {
  const version = browserSessionVersion(claims);
  return new Request("http://localhost:3000/api/browser-extension/captures", {
    method: "POST",
    headers: { origin, host: "workspace.example", "idempotency-key": "review-key", "x-talent-signal-session-version": version },
    body: JSON.stringify({
      schema_version: "browser-capture-handoff.v1", request_id: "12345678-abcd", idempotency_key: "review-key",
      retention_mode: "evidence_crop", purpose: "candidate_conversation_evidence_review", handoff_target: target,
      session: { version, credential_transport: "browser_managed" },
      source: { capture_kind: "page_text", title: "Synthetic profile", url: "https://example.com/profile?private=query#fragment", captured_at: "2026-09-10T00:00:00.000Z" },
      review: { type: "reviewed_text", text: "Synthetic reviewed text", edited_from_selection: false },
      authorization: { decision: "submit_reviewed_capture", approved_at: "2026-09-10T00:01:00.000Z", statement: "Process this source" },
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  readClaims.mockResolvedValue(claims);
  backend.mockImplementation(async () => Response.json({}));
});
describe("browser capture proxy origin", () => {
  it("accepts the browser host behind an internal Next URL and removes URL secrets", async () => {
    expect((await POST(request())).status).toBe(202);
    expect(backend).toHaveBeenCalledWith(claims, "tasks", expect.objectContaining({
      text: "Synthetic reviewed text",
      browser_source: { title: "Synthetic profile", locator: "https://example.com/profile" },
    }));
  });
  it("rejects another origin before checking credentials", async () => {
    expect((await POST(request("https://attacker.example"))).status).toBe(403);
    expect(readClaims).not.toHaveBeenCalled();
    expect(backend).not.toHaveBeenCalled();
  });
  it("rejects a packet addressed to another workspace", async () => {
    expect((await POST(request("https://workspace.example", "https://another.example"))).status).toBe(422);
    expect(backend).not.toHaveBeenCalled();
  });
});
