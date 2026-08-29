import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("persistent workspace shell", () => {
  it("owns account chrome and route-aware product navigation in one layout", () => {
    const layout = read("app/workspace/layout.tsx");
    const navigation = read("components/workspace-shell-nav.tsx");

    expect(layout).toContain("<WorkspaceShellNav />");
    expect(layout).toContain('id="workspace-content"');
    expect(layout).toContain("<AccountControls");
    expect(layout).toContain("fixtureWorkspace");
    expect(layout).toContain(
      "合成测试工作台——仅含评测数据，不是真实招聘记录",
    );
    expect(navigation).toContain('aria-label="工作台导航"');
    expect(navigation).toContain('aria-current={current ? "page" : undefined}');
    expect(navigation).toContain('href: "/workspace/today"');
    expect(navigation).toContain('href: "/workspace?surface=desk"');
    expect(navigation).toContain('href: "/workspace/people"');
  });

  it("leaves global account and navigation controls out of product surfaces", () => {
    for (const relativePath of [
      "components/pursuit-today-page.tsx",
      "components/people-directory-app.tsx",
      "components/relationship-workspace-app.tsx",
    ]) {
      const source = read(relativePath);
      expect(source).not.toContain("signOutOfWorkspace");
      expect(source).not.toContain("<ThemeToggle");
      expect(source).not.toContain('aria-label="Workspace navigation"');
    }
  });

  it("uses a route-neutral local loading state inside the persistent shell", () => {
    const loading = read("app/workspace/loading.tsx");

    expect(loading).toContain("正在打开当前工作台");
    expect(loading).toContain("导航与账号控制仍可使用");
    expect(loading).not.toContain("正在打开依据审阅");
    expect(loading).not.toContain("review-loading__rail");
  });

  it("visually exempts the standalone boundary evaluator from product chrome", () => {
    const shellStyles = read("components/workspace-shell.module.css");
    const boundaryPage = read("app/workspace/boundaries/page.tsx");

    expect(boundaryPage).toContain("<WorkspaceApp");
    expect(shellStyles).toContain(
      ".shell:has(.stage > :global(.review-workspace)) > .rail",
    );
    expect(shellStyles).toContain(
      ".shell:has(.stage > :global(.review-workspace)) > .stage",
    );
  });

  it("focuses the Agent composer from a same-route shell transition and clears the intent", () => {
    const navigation = read("components/workspace-shell-nav.tsx");
    const workspace = read("components/relationship-workspace-app.tsx");

    expect(navigation).toContain(
      'window.dispatchEvent(new Event("talent-signal:focus-agent"))',
    );
    expect(workspace).toContain(
      'window.addEventListener("talent-signal:focus-agent", focusAgent)',
    );
    expect(workspace).toContain('location.searchParams.delete("intent")');
    expect(navigation).toContain("/workspace?surface=desk&intent=compose");
  });
});

describe("relationship workspace initial read", () => {
  it("owns primary reads once and settles independent readbacks concurrently", () => {
    const source = read("lib/server/localBackend.ts");
    const start = source.indexOf(
      "export async function loadRelationshipWorkspaceInitialRead",
    );
    const end = source.indexOf(
      "export type IdentityResolutionWorkflowResult",
      start,
    );
    const loader = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(loader.match(/authenticatedClient\(/g)).toHaveLength(1);
    expect(loader).toContain("await Promise.all([");
    expect(loader).toContain("await Promise.allSettled([");
    expect(loader).toContain("client.getRelationshipAgentHistory(");
    expect(loader).toContain("client.getKnowledge(");
    expect(loader).toContain("accountId: session.account.id");
    expect(loader).toContain("warnings");
  });

  it("passes the signed account boundary even when no review is open", () => {
    const page = read("app/workspace/page.tsx");
    const workspace = read("components/relationship-workspace-app.tsx");

    expect(page).toContain(
      "initialAccountId={initialRead?.accountId ?? null}",
    );
    expect(workspace).toContain("initialAccountId ??");
    expect(workspace).not.toContain("setAccountId(");
  });

  it("routes an expired backend session to a returnable sign-in state", () => {
    const login = read("app/login/page.tsx");
    const today = read("app/workspace/today/page.tsx");
    const people = read("app/workspace/people/page.tsx");
    const workspace = read("app/workspace/page.tsx");

    for (const source of [today, people, workspace]) {
      expect(source).toContain("isBackendSessionExpiredError");
      expect(source).toContain("backendSessionRecoveryHref");
    }
    expect(login).toContain(
      'parameters.reason === "backend_session_expired"',
    );
    expect(login).toContain("系统没有用缓存的关系状态替代当前内容");
  });

  it("funnels relationship feature requests through one expiry boundary", () => {
    const root = read("components/relationship-workspace-app.tsx");
    const request = read(
      "components/workspace-session-request.ts",
    );
    const recovery = read(
      "components/use-workspace-session-recovery.ts",
    );
    const status = read(
      "components/relationship-workspace/relationship-workspace-status.tsx",
    );

    expect(root).toContain("beginSessionRecovery");
    expect(root).not.toContain("await fetch(");
    expect(root).toContain("workspaceSessionFetch(");
    expect(recovery).toContain("WORKSPACE_SESSION_EXPIRED_EVENT");
    expect(request).toContain('response.clone().json()');
    expect(request).toContain(
      'responseCode(payload) === "backend_session_expired"',
    );
    expect(status).toContain("登录后继续处理这段关系");
    expect(status).toContain("上一次核验的关系仍保持可见");
    expect(status).toContain("系统没有替换任何关系状态");
    expect(status).toContain("busy && !sessionRecoveryHref");
  });

  it("opens a related capture review without a same-route hard reload", () => {
    const root = read("components/relationship-workspace-app.tsx");
    const resources = read(
      "components/relationship-workspace/relationship-resource-composer.tsx",
    );
    const readback = read(
      "components/relationship-workspace/use-relationship-workspace-readback.ts",
    );

    expect(resources).toContain("onReviewCapture(");
    expect(resources).not.toContain("href={`/workspace?capture=");
    expect(root).toContain("openWorkspaceReview(captureId)");
    expect(root).toContain("所选采集内容审阅已打开，无需重新加载关系工作台");
    expect(readback).toContain("expectedCaptureId: captureId");
    expect(readback).toContain("payload.subject.id");
    expect(readback).toContain("activeScopeKeyRef.current");
  });

  it("moves a corrected source only after target relationship readback", () => {
    const root = read("components/relationship-workspace-app.tsx");
    const resources = read(
      "components/relationship-workspace/relationship-resource-composer.tsx",
    );
    const readback = read(
      "components/relationship-workspace/use-relationship-workspace-readback.ts",
    );

    expect(resources).toContain("await onIdentityCorrected({");
    expect(resources).not.toContain("router.push(");
    expect(resources).toContain("身份更正已记录");
    expect(root).toContain("openWorkspaceReview(input.captureId");
    expect(root).toContain("setRelationshipScope(correctedScope)");
    expect(root).toContain("现在无需重新加载即可打开");
    expect(readback).toContain("expectedScope.relationshipContextId");
    expect(readback).toContain("targetScopeKey");
    expect(readback).toContain("originScopeKey");
  });

  it("pauses Pursuit writes without hiding the last verified projection", () => {
    const today = read("components/pursuit-today-page.tsx");
    const proposal = read("components/pursuit-proposal-review.tsx");

    for (const source of [today, proposal]) {
      expect(source).toContain("workspaceSessionFetch(");
      expect(source).toContain("workspaceSessionExpired(");
      expect(source).toContain("useWorkspaceSessionRecovery(");
      expect(source).toContain("Boolean(sessionRecoveryHref)");
      expect(source).toContain("重新登录");
    }
    expect(today).toContain("上一次核验的今日视图仍保持可见");
    expect(today).toContain("新的智能助理");
    expect(proposal).toContain("你的决定会继续显示在本页");
    expect(proposal).toContain("不会尝试任何规范写入");
  });

  it("binds refreshed Pursuit state to its canonical object identity", () => {
    const today = read("components/pursuit-today-page.tsx");
    const reviewGate = read("components/pursuit-review-gate.tsx");
    const room = read("app/workspace/pursuits/[id]/page.tsx");

    expect(today).toContain("key={focus.pursuitId}");
    expect(room).toContain("key={pursuit.id}");
    expect(reviewGate).toContain("reviewedProposalIds");
    expect(reviewGate).toContain("key={pending.id}");
    expect(reviewGate).toContain("审阅下一项提案");
  });
});
