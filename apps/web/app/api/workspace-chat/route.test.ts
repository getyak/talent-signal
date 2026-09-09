import { beforeEach, expect, it, vi } from "vitest";
import { TalentSignalHttpError } from "@talent-signal/contracts";
const mocked = vi.hoisted(() => ({ claims: vi.fn(), ask: vi.fn(), origin: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: mocked.claims, backendAuthBaseUrl:()=>"http://127.0.0.1:4317", authSecret:()=>"synthetic-test-secret" }));
vi.mock("@/lib/server/workspaceChat", () => ({ askWorkspaceChat: mocked.ask }));
vi.mock("@/lib/request-origin", () => ({ isAllowedMutationOrigin: mocked.origin }));
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { POST } from "./route";
const claims = {backendAccountId:"account-a",backendUserId:"user-a",backendAccessToken:"synthetic-token-a",backendExpiresAt:"2099-01-01T00:00:00Z",backendAccountName:"a",backendAccountSlug:"a",backendRole:"member" as const,backendUsername:null};
const request = (binding: string | null = contactHandoffSessionVersion(claims)) => new Request("http://localhost/api/workspace-chat", { method:"POST", headers:{"Content-Type":"application/json",...(binding?{"x-workspace-session":binding}:{})}, body:JSON.stringify({objective:"hello"}) });
beforeEach(()=>{vi.clearAllMocks();mocked.origin.mockReturnValue(true);mocked.claims.mockResolvedValue(claims);mocked.ask.mockResolvedValue({blocks:[{body:"hello"}]});});
it("rejects cross-origin writes before authentication/backend access",async()=>{mocked.origin.mockReturnValue(false);expect((await POST(request())).status).toBe(403);expect(mocked.claims).not.toHaveBeenCalled();});
it("requires an authenticated backend identity",async()=>{mocked.claims.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect(mocked.ask).not.toHaveBeenCalled();});
it("preserves typed retry status and never retries the provider itself",async()=>{mocked.ask.mockRejectedValue(new TalentSignalHttpError(503,"CLAUDE_CHAT_RETRYABLE_FAILURE","retry",null));const response=await POST(request());expect(response.status).toBe(503);expect((await response.json()).code).toBe("CLAUDE_CHAT_RETRYABLE_FAILURE");expect(mocked.ask).toHaveBeenCalledTimes(1);});
it("returns canonical results without caching",async()=>{const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(await response.json()).toEqual({blocks:[{body:"hello"}]});});
it.each([
 {backendAccountId:"account-b",backendUserId:"user-b",backendAccessToken:"synthetic-token-b"},
 {backendUserId:"different-user"},
 {backendAccessToken:"same-user-new-login"},
 {backendExpiresAt:"2099-02-01T00:00:00Z"},
])("rejects a stale UI login before Session or model access: %j",async change=>{
 const stale=request();mocked.claims.mockResolvedValue({...claims,...change});const response=await POST(stale);expect(response.status).toBe(409);expect((await response.json()).code).toBe("session_stale");expect(mocked.ask).not.toHaveBeenCalled();
});
it("requires the UI session binding",async()=>{expect((await POST(request(null))).status).toBe(409);expect(mocked.ask).not.toHaveBeenCalled();});
it("preserves expired-session recovery",async()=>{mocked.claims.mockResolvedValue({...claims,backendExpiresAt:"2020-01-01T00:00:00Z"});const response=await POST(request());expect(response.status).toBe(401);expect((await response.json()).code).toBe("backend_session_expired");});
