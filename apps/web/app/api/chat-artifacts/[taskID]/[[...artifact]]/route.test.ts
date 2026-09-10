import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const {claims}=vi.hoisted(()=>({claims:vi.fn()}));
vi.mock("@/lib/server/backendAuth",()=>({readBackendSessionClaims:claims,backendAuthBaseUrl:()=>"http://127.0.0.1:4317",authSecret:()=>"synthetic"}));
import {contactHandoffSessionVersion} from "@/lib/server/contact-handoff-session";
import {GET} from "./route";
const taskID="10000000-0000-4000-8000-000000000001",id="10000000-0000-4000-8000-000000000002",upstream=vi.fn();
const identity={backendAccessToken:"synthetic-owner-token",backendExpiresAt:"2099-01-01T00:00:00Z",backendAccountId:"synthetic-account",backendUserId:"synthetic-user"};
const request=new NextRequest("https://synthetic.local/api/chat-artifacts/"+taskID,{headers:{"x-workspace-session":contactHandoffSessionVersion(identity as never)}});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",upstream);claims.mockResolvedValue(identity);});
afterEach(()=>vi.unstubAllGlobals());
it("rejects traversal and absent login before contacting the backend",async()=>{
  expect((await GET(request,{params:Promise.resolve({taskID,artifact:["../secrets"]})})).status).toBe(404);
  claims.mockResolvedValue(null);expect((await GET(request,{params:Promise.resolve({taskID})})).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});
it("preserves exact attachment bytes using only the active owner's token",async()=>{
  upstream.mockResolvedValue(new Response('"hours"\r\n"7"\r\n',{headers:{"content-type":"text/csv","content-disposition":'attachment; filename="hours.csv"'}}));
  const response=await GET(request,{params:Promise.resolve({taskID,artifact:[id]})});
  expect(await response.text()).toBe('"hours"\r\n"7"\r\n');expect(response.headers.get("content-disposition")).toContain("hours.csv");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(upstream).toHaveBeenCalledWith(`http://127.0.0.1:4317/v1/chat/tasks/${taskID}/artifacts/${id}`,
    expect.objectContaining({headers:{authorization:"Bearer synthetic-owner-token"},redirect:"error",cache:"no-store"}));
});
it("preserves source revocation rather than serving an old download",async()=>{
  upstream.mockResolvedValue(new Response('{"error":{"code":"RUN_ARTIFACT_UNAVAILABLE"}}',{status:410}));
  const response=await GET(request,{params:Promise.resolve({taskID,artifact:[id]})});expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("rejects a replaced login before forwarding old artifact requests",async()=>{
  claims.mockResolvedValue({...identity,backendAccessToken:"replacement-login"});
  expect((await GET(request,{params:Promise.resolve({taskID,artifact:[id]})})).status).toBe(409);
  expect(upstream).not.toHaveBeenCalled();
});
