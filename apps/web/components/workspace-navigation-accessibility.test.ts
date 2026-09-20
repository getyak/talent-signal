import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pathname = vi.hoisted(() => ({ current: "/workspace" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkspaceShellNav, WorkspaceMobileSourcesLink } from "@/components/workspace-shell-nav";
import {
  WORKSPACE_NAV_ROUTES,
  workspaceMobileNavRoutes,
} from "@/lib/workspace-navigation";

const webRoot = resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

function render() {
  pathname.current = "/workspace";
  return renderToStaticMarkup(
    createElement(WorkspaceShellNav, { binding: null }),
  );
}

describe("workspace navigation accessibility and reachability", () => {
  it("names the navigation landmark and every primary destination", () => {
    const html = render();
    expect(html).toContain('aria-label="工作台导航"');
    for (const route of WORKSPACE_NAV_ROUTES.filter(
      (item) => item.section === "primary",
    )) {
      expect(html).toContain(`href="${route.href}"`);
      expect(html).toContain(`>${route.label}<`);
    }
  });

  it("renders the direct desktop order with no duplicate Sessions or More row", () => {
    const html = render();
    expect(html).not.toContain("更多");
    expect(html).not.toContain('href="/workspace/sessions"');
    expect(html).not.toContain('href="/workspace/plugs"');
    const indices = [
      "/workspace",
      "/workspace/today",
      "/workspace/people",
      "/workspace/meetings",
      "/workspace/captures",
    ].map((href) => html.indexOf(`href="${href}"`));
    expect(indices.every((index) => index > -1)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("keeps the compact dock to four destinations plus a named source button", () => {
    expect(workspaceMobileNavRoutes().map((item) => item.id)).toEqual([
      "home",
      "today",
      "people",
      "meetings",
    ]);
    const html = render();
    for (const route of WORKSPACE_NAV_ROUTES) {
      expect(html).toContain(
        `data-mobile="${route.mobile ? "true" : "false"}"`,
      );
    }
    expect(read("components/workspace-shell-nav.tsx")).toContain(
      'aria-label="打开来源"',
    );
  });

  it("keeps both conversations and sources directly reachable on narrow screens", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceMobileSourcesLink));
    expect(html).toContain('href="/workspace/sessions"');
    expect(html).toContain('aria-label="打开全部对话"');
    expect(html).toContain('href="/workspace/captures"');
    expect(html).toContain('aria-label="打开来源"');
  });

  it("keeps the removed routes reachable through their owning surfaces", () => {
    const nav = read("components/workspace-shell-nav.tsx");
    const recentSessions = read("components/workspace-recent-sessions.tsx");
    const accountMenu = read("components/workspace-account-menu.tsx");

    // Sessions: recent-Sessions header when expanded, one named icon link when
    // the rail is collapsed.
    expect(recentSessions).toContain('href="/workspace/sessions"');
    expect(nav).toContain("collapsedUtility");
    expect(nav).toContain("data-collapsed-only");
    expect(nav).not.toContain("WorkspaceMoreDestinations");
    // Connections: account utilities with a real Plugs icon.
    expect(accountMenu).toContain("Plugs");
    expect(accountMenu).toContain("/workspace/plugs");
  });
});
