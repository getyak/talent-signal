import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { auth, claims } = vi.hoisted(() => ({
  auth: vi.fn(),
  claims: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/login/actions", () => ({ signOutOfWorkspace: vi.fn() }));
vi.mock("@/app/workspace/settings/testing/actions", () => ({
  leaveTestWorkspace: vi.fn(),
}));
vi.mock("@/lib/server/backendAuth", () => ({
  readPrimaryBackendSessionClaims: async () => null,
  readBackendSessionClaims: claims,
  authSecret: () => "workspace-shell-render-test-secret",
}));
vi.mock("@/lib/server/testWorkspaceSession", () => ({
  TEST_WORKSPACE_COOKIE: "test-cookie",
  testWorkspaceSession: async () => null,
}));
vi.mock("@/components/talent-signal-lab/lab-shell", () => ({
  TalentSignalLabShell: ({ children }: { children: React.ReactNode }) => children,
}));
// The canvas is a client surface; a bare react-dom/server render still needs
// the router context Next provides in the app.
vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import WorkspaceLayout from "@/app/workspace/layout";
import { WorkspaceNewConversation } from "@/components/new-conversation";

function liveClaims() {
  return {
    backendAccountId: "account-1",
    backendAccountName: "Alpha 寻访测试",
    backendAccountSlug: "alpha",
    backendExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe("quiet workspace shell render", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the reference chrome: brand, primary nav, real account footer", async () => {
    auth.mockResolvedValue({ user: { name: "Synthetic Recruiter" } });
    claims.mockResolvedValue(liveClaims());
    const html = renderToStaticMarkup(
      await WorkspaceLayout({ children: createElement("main", null, "child") }),
    );

    expect(html).toContain("Talent Signal");
    expect(html).toContain("工作台导航");
    expect(html).toContain("新对话");
    expect(html).toContain("人物");
    expect(html).toContain("日程");
    expect(html).toContain("连接");
    expect(html).toContain("今日");
    expect(html).toContain("来源");
    // The account footer carries the real account and workspace, not just initials.
    expect(html).toContain("Synthetic Recruiter");
    expect(html).toContain("Alpha 寻访测试");
    expect(html).toContain(">SR<");
    expect(html).toContain("账号与空间操作");
    expect(html).toContain("child");
  });

  it("renders the quiet conversation canvas as the default entry", async () => {
    auth.mockResolvedValue({ user: { name: "Synthetic Recruiter" } });
    claims.mockResolvedValue(liveClaims());
    const html = renderToStaticMarkup(
      await WorkspaceLayout({
        children: createElement(WorkspaceNewConversation, {
          accountId: "account-1",
          sessionBinding: "session-binding",
          sessionVersion: "session-version",
          storageScope: "a".repeat(64),
        }),
      }),
    );

    expect(html).toContain("今天想推进什么？");
    expect(html).toContain("输入消息，或粘贴一段内容…");
    expect(html).toContain("选择人物");
    expect(html).toContain("new-conversation-objective");
  });

  it("keeps the unauthenticated boundary free of product chrome", async () => {
    auth.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await WorkspaceLayout({ children: createElement("main", null, "boundary") }),
    );
    expect(html).toContain("boundary");
    expect(html).not.toContain("工作台导航");
  });
});
