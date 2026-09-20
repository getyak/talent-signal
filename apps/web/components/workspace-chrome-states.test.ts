import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const directory = vi.hoisted(() => ({ data: null as unknown, loading: false, failed: false, retry: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/workspace", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./workspace-search", () => ({ useWorkspaceDirectory: () => directory }));
import { WorkspaceRecentSessions } from "./workspace-recent-sessions";
import { WorkspaceAccountMenu } from "./workspace-account-menu";
import { SessionDirectory } from "./session-workbench/session-directory";
beforeEach(() => { directory.data = { sessions: { session_version: "a", sessions: [] } }; directory.loading = false; directory.failed = false; });
describe("quiet workspace chrome states", () => {
  it("keeps a named history entry without an empty placeholder or all link", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceRecentSessions, { binding: "a" }));
    expect(html).toContain('href="/workspace/sessions"');
    expect(html).toContain("对话记录");
    expect(html).not.toContain("还没有对话");
    expect(html).not.toContain(">全部<");
  });
  it("keeps read failure distinct from empty with a real retry", () => {
    directory.failed = true;
    const html = renderToStaticMarkup(createElement(WorkspaceRecentSessions, { binding: "a" }));
    expect(html).toContain("暂时无法读取");
    expect(html).toContain(">重试</button>");
    expect(html).not.toContain("还没有对话");
  });
  it("does not label a failed directory as an invitation to start empty", () => {
    const html = renderToStaticMarkup(createElement(SessionDirectory, { initialSessions: [], initialComplete: false, initialNextCursor: null, sessionVersion: "a", initialError: "无法读取", sessionRecoveryHref: null }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("每段思路");
    expect(html).not.toContain("开始一段新对话，它会留在这里");
  });
  it("renders language with an icon and preserves a truthful fixed-language value", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceAccountMenu, { accountName: "Synthetic User", workspaceName: "Test", signOutAction: () => {} }));
    expect(html).toMatch(/<svg[^>]*>[\s\S]*?<\/svg><span>语言<\/span><strong>简体中文<\/strong>/);
    expect(html).not.toContain('href="/workspace/plugs"');
  });
});
