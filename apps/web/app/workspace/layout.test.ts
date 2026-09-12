import { beforeEach, expect, it, vi } from "vitest";
const {claims,settings} = vi.hoisted(()=>({claims:vi.fn(),settings:vi.fn()}));
vi.mock("@/auth",()=>({auth:async()=>({user:{name:"Owner"}})}));
vi.mock("next/headers",()=>({cookies:async()=>({has:()=>true})}));
vi.mock("@/app/login/actions",()=>({signOutOfWorkspace:vi.fn()}));
vi.mock("@/app/workspace/settings/testing/actions",()=>({leaveTestWorkspace:vi.fn()}));
vi.mock("@/lib/server/accountBackend",()=>({loadAccountSettings:settings}));
vi.mock("@/lib/server/backendAuth",()=>({readBackendSessionClaims:claims,readPrimaryBackendSessionClaims:async()=>null}));
vi.mock("@/lib/server/testWorkspaceSession",()=>({testWorkspaceSession:async()=>null,TEST_WORKSPACE_COOKIE:"test-cookie"}));
vi.mock("@/components/talent-signal-lab/lab-shell",()=>({TalentSignalLabShell:()=>null}));
vi.mock("@/components/workspace-shell-nav",()=>({WorkspaceCaptureLink:()=>null,WorkspaceShellNav:()=>null}));
vi.mock("@/components/theme-toggle",()=>({ThemeToggle:()=>null}));
import WorkspaceLayout from "./layout";
function snapshot(value: unknown): string {
 return JSON.stringify(value, (key,item) => key === "type" || key.startsWith("_") ? undefined : item);
}
beforeEach(()=>{vi.clearAllMocks();settings.mockRejectedValue(new Error("Settings unavailable"));});
it("retains effective workspace scope when optional settings fail",async()=>{
 claims.mockResolvedValue({backendAccountId:"rendered-test",backendAccountName:"Test",backendAccountSlug:"lab-test",backendExpiresAt:new Date(Date.now()+60000).toISOString()});
 const rendered=snapshot(await WorkspaceLayout({children:"operational-child"}));
 expect(rendered).toContain('"data-workspace-scope":"rendered-test"');
 expect(rendered).toContain("operational-child");
 expect(settings).not.toHaveBeenCalled();
});
it.each([null,{backendAccountId:"expired-test",backendExpiresAt:"2000-01-01T00:00:00Z"}])("does not render workspace or Lab controls without a current scope",async scope=>{
 claims.mockResolvedValue(scope);
 const rendered=snapshot(await WorkspaceLayout({children:"operational-child"}));
 expect(rendered).not.toContain("operational-child");
 expect(rendered).not.toContain("workspace-content");
 expect(rendered).toContain("返回我的空间");
});
