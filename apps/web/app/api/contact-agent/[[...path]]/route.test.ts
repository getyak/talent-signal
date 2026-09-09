import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { readClaims } = vi.hoisted(() => ({ readClaims: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: readClaims,
  backendAuthBaseUrl: () => "http://127.0.0.1:4317", authSecret: () => "synthetic-test-secret" }));
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { POST, GET } from "./route";
const original = { backendAccessToken: "synthetic-session-A", backendAccountId: "account-A", backendUserId: "user-A",
  backendExpiresAt: "2099-01-01T00:00:00.000Z", backendAccountName: "Synthetic", backendAccountSlug: "synthetic", backendRole: "member" as const, backendUsername: null };
const version=contactHandoffSessionVersion(original), upstream=vi.fn();
beforeEach(()=>{ vi.clearAllMocks(); readClaims.mockResolvedValue(original); vi.stubGlobal("fetch",upstream); });
afterEach(()=>vi.unstubAllGlobals());
function request(method="POST") {return new NextRequest("http://localhost:3000/api/contact-agent/tasks",{method,
  headers:{origin:"http://localhost:3000",host:"localhost:3000","x-contact-handoff-session":version},
  ...(method==="POST"?{body:JSON.stringify({image:"synthetic-reviewed-pixels"})}:{})});}
it.each([
  { backendAccountId:"account-B", backendUserId:"user-B", backendAccessToken:"synthetic-session-B" },
  { backendAccessToken:"synthetic-new-login-same-user" },
])("rejects changed identity or session before forwarding reviewed evidence: %j",async changes=>{
  readClaims.mockResolvedValue({...original,...changes});
  expect((await POST(request(),{params:Promise.resolve({path:["tasks"]})})).status).toBe(409);
  expect(upstream).not.toHaveBeenCalled();
  expect((await GET(request("GET"),{params:Promise.resolve({path:["tasks"]})})).status).toBe(409);
});
it("forwards with the same claims used for the binding and excludes the binding from backend headers",async()=>{
  upstream.mockResolvedValue(new Response(JSON.stringify({task_id:"synthetic"}),{status:201}));
  expect((await POST(request(),{params:Promise.resolve({path:["tasks"]})})).status).toBe(201);
  expect(readClaims).toHaveBeenCalledOnce();
  expect(upstream.mock.calls[0]?.[1].headers).toEqual({authorization:"Bearer synthetic-session-A","content-type":"application/json","x-talent-signal-platform":"web"});
  expect(version).toMatch(/^[a-f0-9]{64}$/u);expect(version).not.toContain(original.backendAccessToken);
});
