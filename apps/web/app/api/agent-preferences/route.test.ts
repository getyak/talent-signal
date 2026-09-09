import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { TalentSignalClient } from "@talent-signal/contracts";
const { claims: readClaims } = vi.hoisted(() => ({ claims: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: readClaims, backendAuthBaseUrl: () => "http://127.0.0.1:4317", authSecret: () => "synthetic-test-secret" }));
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { GET, PUT } from "./route";
const claims = { backendAccountId: "account-a", backendUserId: "user-a", backendAccessToken: "synthetic-token-a", backendExpiresAt: "2099-01-01T00:00:00Z", backendAccountName: "a", backendAccountSlug: "a", backendRole: "member" as const, backendUsername: null };
const save = vi.spyOn(TalentSignalClient.prototype, "saveAgentPreference");
const read = vi.spyOn(TalentSignalClient.prototype, "getAgentPreference");
const input = { idempotency_key: "10000000-0000-4000-8000-000000000001", expected_revision: 3, response_style: "conclusion_first" };
const request = (method: "GET" | "PUT", binding: string | null = contactHandoffSessionVersion(claims), body = JSON.stringify(input)) => new NextRequest("http://localhost:3000/api/agent-preferences", { method, headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", ...(binding ? { "x-workspace-session": binding } : {}) }, ...(method === "PUT" ? { body } : {}) });
beforeEach(() => { vi.clearAllMocks(); readClaims.mockResolvedValue(claims); });
describe("reply preference proxy boundary", () => {
  it("requires authenticated backend identity before reading", async () => {
    readClaims.mockResolvedValue(null);
    expect((await GET(request("GET"))).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before forwarding an account credential", async () => {
    const result = await PUT(new NextRequest("http://localhost:3000/api/agent-preferences", { method: "PUT", headers: { origin: "https://other.invalid", host: "localhost:3000" }, body: "{}" }));
    expect(result.status).toBe(403); expect(readClaims).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("preserves the exact review revision and retry identity, and bounds request bytes", async () => {
    save.mockResolvedValue({ preference: { response_style: "conclusion_first", revision: 4 } } as Awaited<ReturnType<typeof save>>);
    const result = await PUT(request("PUT"));
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(save).toHaveBeenCalledWith(input);
    save.mockClear();
    expect((await PUT(request("PUT", contactHandoffSessionVersion(claims), " ".repeat(4097)))).status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });
  it.each([
    { backendAccountId: "account-b", backendUserId: "user-b", backendAccessToken: "token-b" },
    { backendUserId: "another-user" },
    { backendAccessToken: "same-user-new-login" },
    { backendExpiresAt: "2099-02-01T00:00:00Z" },
  ])("rejects stale reads and writes before contacting the backend: %j", async change => {
    readClaims.mockResolvedValue({ ...claims, ...change });
    for (const method of ["GET", "PUT"] as const) {
      const result = await (method === "GET" ? GET : PUT)(request(method));
      expect(result.status).toBe(409); expect((await result.json()).code).toBe("session_stale");
    }
    expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("requires binding for both reads and mutations", async () => {
    expect((await GET(request("GET", null))).status).toBe(409);
    expect((await PUT(request("PUT", null))).status).toBe(409);
    expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("rejects expired login before preference access", async () => {
    readClaims.mockResolvedValue({ ...claims, backendExpiresAt: "2020-01-01T00:00:00Z" });
    expect((await GET(request("GET"))).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects readback after the account changes following an accepted save", async () => {
    save.mockResolvedValue({ preference: { response_style: "conclusion_first", revision: 4 } } as Awaited<ReturnType<typeof save>>);
    expect((await PUT(request("PUT"))).status).toBe(200);
    readClaims.mockResolvedValue({ ...claims, backendAccessToken: "changed-after-save" });
    expect((await GET(request("GET"))).status).toBe(409);
    expect(save).toHaveBeenCalledTimes(1); expect(read).not.toHaveBeenCalled();
  });
});
